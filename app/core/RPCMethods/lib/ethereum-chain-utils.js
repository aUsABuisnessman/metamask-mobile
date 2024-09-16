import { rpcErrors } from '@metamask/rpc-errors';
import validUrl from 'valid-url';
import { isSafeChainId } from '@metamask/controller-utils';
import { jsonRpcRequest } from '../../../util/jsonRpcRequest';
import {
  getDecimalChainId,
  isPrefixedFormattedHexString,
  getDefaultNetworkByChainId,
} from '../../../util/networks';
import {
  CaveatFactories,
  PermissionKeys,
} from '../../../core/Permissions/specifications';
import { CaveatTypes } from '../../../core/Permissions/constants';
import { PermissionDoesNotExistError } from '@metamask/permission-controller';

const EVM_NATIVE_TOKEN_DECIMALS = 18;

export function validateChainId(chainId) {
  const _chainId = typeof chainId === 'string' && chainId.toLowerCase();

  if (!isPrefixedFormattedHexString(_chainId)) {
    throw rpcErrors.invalidParams(
      `Expected 0x-prefixed, unpadded, non-zero hexadecimal string 'chainId'. Received:\n${chainId}`,
    );
  }

  if (!isSafeChainId(_chainId)) {
    throw rpcErrors.invalidParams(
      `Invalid chain ID "${_chainId}": numerical value greater than max safe value. Received:\n${chainId}`,
    );
  }

  return _chainId;
}

export function validateAddEthereumChainParams(params) {
  if (!params || typeof params !== 'object') {
    throw rpcErrors.invalidParams({
      message: `Expected single, object parameter. Received:\n${JSON.stringify(
        params,
      )}`,
    });
  }

  const {
    chainId,
    chainName: rawChainName = null,
    blockExplorerUrls = null,
    nativeCurrency = null,
    rpcUrls,
  } = params;

  const allowedKeys = {
    chainId: true,
    chainName: true,
    blockExplorerUrls: true,
    nativeCurrency: true,
    rpcUrls: true,
    iconUrls: true,
  };

  const extraKeys = Object.keys(params).filter((key) => !allowedKeys[key]);
  if (extraKeys.length) {
    throw rpcErrors.invalidParams(
      `Received unexpected keys on object parameter. Unsupported keys:\n${extraKeys}`,
    );
  }

  const _chainId = validateChainId(chainId);
  const firstValidRPCUrl = validateRpcUrls(rpcUrls);
  const firstValidBlockExplorerUrl =
    validateBlockExplorerUrls(blockExplorerUrls);
  const chainName = validateChainName(rawChainName);
  const ticker = validateNativeCurrency(nativeCurrency);

  return {
    chainId: _chainId,
    chainName,
    firstValidRPCUrl,
    firstValidBlockExplorerUrl,
    ticker,
  };
}

function validateRpcUrls(rpcUrls) {
  const dirtyFirstValidRPCUrl = Array.isArray(rpcUrls)
    ? rpcUrls.find((rpcUrl) => validUrl.isHttpsUri(rpcUrl))
    : null;

  const firstValidRPCUrl = dirtyFirstValidRPCUrl
    ? dirtyFirstValidRPCUrl.replace(/([^/])\/+$/g, '$1')
    : dirtyFirstValidRPCUrl;

  if (!firstValidRPCUrl) {
    throw rpcErrors.invalidParams(
      `Expected an array with at least one valid string HTTPS url 'rpcUrls', Received:\n${rpcUrls}`,
    );
  }

  return firstValidRPCUrl;
}

function validateBlockExplorerUrls(blockExplorerUrls) {
  const firstValidBlockExplorerUrl =
    blockExplorerUrls !== null && Array.isArray(blockExplorerUrls)
      ? blockExplorerUrls.find((blockExplorerUrl) =>
          validUrl.isHttpsUri(blockExplorerUrl),
        )
      : null;

  if (blockExplorerUrls !== null && !firstValidBlockExplorerUrl) {
    throw rpcErrors.invalidParams(
      `Expected null or array with at least one valid string HTTPS URL 'blockExplorerUrl'. Received: ${blockExplorerUrls}`,
    );
  }

  return firstValidBlockExplorerUrl;
}

function validateChainName(rawChainName) {
  if (typeof rawChainName !== 'string' || !rawChainName) {
    throw rpcErrors.invalidParams({
      message: `Expected non-empty string 'chainName'. Received:\n${rawChainName}`,
    });
  }
  return rawChainName.length > 100
    ? rawChainName.substring(0, 100)
    : rawChainName;
}

function validateNativeCurrency(nativeCurrency) {
  if (nativeCurrency !== null) {
    if (typeof nativeCurrency !== 'object' || Array.isArray(nativeCurrency)) {
      throw rpcErrors.invalidParams({
        message: `Expected null or object 'nativeCurrency'. Received:\n${nativeCurrency}`,
      });
    }
    if (nativeCurrency.decimals !== EVM_NATIVE_TOKEN_DECIMALS) {
      throw rpcErrors.invalidParams({
        message: `Expected the number 18 for 'nativeCurrency.decimals' when 'nativeCurrency' is provided. Received: ${nativeCurrency.decimals}`,
      });
    }

    if (!nativeCurrency.symbol || typeof nativeCurrency.symbol !== 'string') {
      throw rpcErrors.invalidParams({
        message: `Expected a string 'nativeCurrency.symbol'. Received: ${nativeCurrency.symbol}`,
      });
    }
  }
  const ticker = nativeCurrency?.symbol || 'ETH';

  if (typeof ticker !== 'string' || ticker.length < 2 || ticker.length > 6) {
    throw rpcErrors.invalidParams({
      message: `Expected 2-6 character string 'nativeCurrency.symbol'. Received:\n${ticker}`,
    });
  }

  return ticker;
}

export async function validateRpcEndpoint(rpcUrl, chainId) {
  try {
    const endpointChainId = await jsonRpcRequest(rpcUrl, 'eth_chainId');
    if (chainId !== endpointChainId) {
      throw rpcErrors.invalidParams({
        message: `Chain ID returned by RPC URL ${rpcUrl} does not match ${chainId}`,
        data: { chainId: endpointChainId },
      });
    }
  } catch (err) {
    throw rpcErrors.internal({
      message: `Request for method 'eth_chainId on ${rpcUrl} failed`,
      data: { networkErr: err },
    });
  }
}

export function findExistingNetwork(chainId, networkConfigurations) {
  const existingNetworkDefault = getDefaultNetworkByChainId(chainId);
  const existingEntry = Object.entries(networkConfigurations).find(
    ([, networkConfiguration]) => networkConfiguration.chainId === chainId,
  );

  return existingEntry || existingNetworkDefault;
}

export async function switchToNetwork({
  network,
  chainId,
  controllers,
  requestUserApproval,
  analytics,
  origin,
  isAddNetworkFlow = false,
}) {
  const {
    CurrencyRateController,
    NetworkController,
    PermissionController,
    SelectedNetworkController,
  } = controllers;

  const getCaveat = ({ target, caveatType }) => {
    try {
      return PermissionController.getCaveat(origin, target, caveatType);
    } catch (e) {
      if (e instanceof PermissionDoesNotExistError) {
        // suppress expected error in case that the origin
        // does not have the target permission yet
      } else {
        throw e;
      }
    }

    return undefined;
  };

  const [networkConfigurationId, networkConfiguration] = network;

  const requestData = {
    rpcUrl: networkConfiguration.rpcUrl,
    chainId,
    chainName:
      networkConfiguration.chainName ||
      networkConfiguration.nickname ||
      networkConfiguration.shortName,
    ticker: networkConfiguration.ticker || 'ETH',
  };

  const analyticsParams = {
    chain_id: getDecimalChainId(chainId),
    source: 'Custom Network API',
    symbol: networkConfiguration?.ticker || 'ETH',
    ...analytics,
  };

  if (process.env.MULTICHAIN_V1) {
    const { value: permissionedChainIds } =
      getCaveat({
        target: PermissionKeys.permittedChains,
        caveatType: CaveatTypes.restrictNetworkSwitching,
      }) ?? {};
    if (
      permissionedChainIds === undefined ||
      !permissionedChainIds.includes(chainId)
    ) {
      if (isAddNetworkFlow) {
        await PermissionController.grantPermissionsIncremental({
          subject: { origin },
          approvedPermissions: {
            [PermissionKeys.permittedChains]: {
              caveats: [
                CaveatFactories[CaveatTypes.restrictNetworkSwitching]([
                  chainId,
                ]),
              ],
            },
          },
        });
      } else {
        await PermissionController.requestPermissionsIncremental({
          subject: { origin },
          requestedPermissions: {
            [PermissionKeys.permittedChains]: {
              caveats: [
                CaveatFactories[CaveatTypes.restrictNetworkSwitching]([
                  chainId,
                ]),
              ],
            },
          },
        });
      }
    }
  } else {
    const requestModalType = isAddNetworkFlow ? 'new' : 'switch';

    await requestUserApproval({
      type: 'SWITCH_ETHEREUM_CHAIN',
      requestData: { ...requestData, type: requestModalType },
    });
  }

  const originHasAccountsPermission = PermissionController.hasPermission(
    origin,
    'eth_accounts',
  );

  if (process.env.MULTICHAIN_V1 && originHasAccountsPermission) {
    SelectedNetworkController.setNetworkClientIdForDomain(
      origin,
      networkConfigurationId || networkConfiguration.networkType,
    );
  } else {
    CurrencyRateController.updateExchangeRate(requestData.ticker);
    NetworkController.setActiveNetwork(
      networkConfigurationId || networkConfiguration.networkType,
    );
  }

  return analyticsParams;
}