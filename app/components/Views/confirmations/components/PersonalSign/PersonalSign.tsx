import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { InteractionManager, Text, View } from 'react-native';
import { useSelector } from 'react-redux';
import { strings } from '../../../../../../locales/i18n';
import { KEYSTONE_TX_CANCELED } from '../../../../../constants/error';
import { MetaMetricsEvents } from '../../../../../core/Analytics';
import Engine from '../../../../../core/Engine';
import NotificationManager from '../../../../../core/NotificationManager';
import {
  getAddressAccountType,
  isExternalHardwareAccount,
  stripHexPrefix,
} from '../../../../../util/address';
import { sanitizeString } from '../../../../../util/string';
import { useTheme } from '../../../../../util/theme';
import { WALLET_CONNECT_ORIGIN } from '../../../../../util/walletconnect';
import SignatureRequest from '../SignatureRequest';
import ExpandedMessage from '../SignatureRequest/ExpandedMessage';
import createStyles from './styles';
import { PersonalSignProps } from './types';

import { SigningBottomSheetSelectorsIDs } from '../../../../../../e2e/selectors/Browser/SigningBottomSheet.selectors';
import { useMetrics } from '../../../../../components/hooks/useMetrics';
import AppConstants from '../../../../../core/AppConstants';
import { selectChainId } from '../../../../../selectors/networkController';
import { store } from '../../../../../store';
import Logger from '../../../../../util/Logger';
import { getBlockaidMetricsParams } from '../../../../../util/blockaid';
import createExternalSignModelNav from '../../../../../util/hardwareWallet/signatureUtils';
import { getDecimalChainId } from '../../../../../util/networks';
import { SecurityAlertResponse } from '../BlockaidBanner/BlockaidBanner.types';

/**
 * Converts a hexadecimal string to a utf8 string.
 * If the hexadecimal string is 32 bytes long, it is assumed to be a hash and returned as is.
 *
 * @param {string} hex - Hexadecimal string to convert
 * @returns {string} - The utf8 equivalent or the original hexadecimal string.
 */
function msgHexToText(hex: string): string {
  try {
    const stripped = stripHexPrefix(hex);
    const buff = Buffer.from(stripped, 'hex');
    return buff.length === 32 ? hex : buff.toString('utf8');
  } catch (e) {
    Logger.log(e);
    return hex;
  }
}

/**
 * Component that supports personal_sign
 */
const PersonalSign = ({
  onConfirm,
  onReject,
  messageParams,
  currentPageInformation,
  toggleExpandedMessage,
  showExpandedMessage,
}: PersonalSignProps) => {
  const navigation = useNavigation();
  const { trackEvent } = useMetrics();
  const [truncateMessage, setTruncateMessage] = useState<boolean>(false);
  const { securityAlertResponse } = useSelector(
    // TODO: Replace "any" with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (reduxState: any) => reduxState.signatureRequest,
  );

  // TODO: Replace "any" with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { colors }: any = useTheme();
  const styles = createStyles(colors);

  interface AnalyticsParams {
    account_type?: string;
    dapp_host_name?: string;
    chain_id?: string;
    signature_type?: string;
    [key: string]: string | undefined;
  }

  const getAnalyticsParams = useCallback((): AnalyticsParams => {
    const pageInfo = currentPageInformation || messageParams.meta || {};

    const chainId = selectChainId(store.getState());
    const fallbackUrl = 'N/A';

    let urlHost = fallbackUrl;
    if (pageInfo.url) {
      try {
        const url = new URL(pageInfo.url);
        urlHost = url.host || fallbackUrl;
      } catch (error) {
        Logger.error(error as Error, 'Error parsing URL in signature request');
      }
    }

    let blockaidParams: Record<string, unknown> = {};
    if (securityAlertResponse) {
      blockaidParams = getBlockaidMetricsParams(
        securityAlertResponse as SecurityAlertResponse,
      );
    }

    return {
      account_type: getAddressAccountType(messageParams.from),
      dapp_host_name: urlHost,
      chain_id: chainId ? getDecimalChainId(chainId) : 'N/A',
      signature_type: 'personal_sign',
      ...pageInfo.analytics,
      ...blockaidParams,
    };
  }, [currentPageInformation, messageParams, securityAlertResponse]);

  useEffect(() => {
    const onSignatureError = ({ error }: { error: Error }) => {
      if (error?.message.startsWith(KEYSTONE_TX_CANCELED)) {
        trackEvent(
          MetaMetricsEvents.QR_HARDWARE_TRANSACTION_CANCELED,
          getAnalyticsParams(),
        );
      }
    };
    Engine.context.SignatureController.hub.on(
      `${messageParams.metamaskId}:signError`,
      onSignatureError,
    );
    return () => {
      Engine.context.SignatureController.hub.removeListener(
        `${messageParams.metamaskId}:signError`,
        onSignatureError,
      );
    };
  }, [getAnalyticsParams, messageParams.metamaskId, trackEvent]);

  const showWalletConnectNotification = (confirmation = false) => {
    InteractionManager.runAfterInteractions(() => {
      messageParams.origin &&
        (messageParams.origin.startsWith(WALLET_CONNECT_ORIGIN) ||
          messageParams.origin.startsWith(
            AppConstants.MM_SDK.SDK_REMOTE_ORIGIN,
          )) &&
        NotificationManager.showSimpleNotification({
          status: `simple_notification${!confirmation ? '_rejected' : ''}`,
          duration: 5000,
          title: confirmation
            ? strings('notifications.wc_signed_title')
            : strings('notifications.wc_signed_rejected_title'),
          description: strings('notifications.wc_description'),
        });
    });
  };

  const rejectSignature = async () => {
    await onReject();
    showWalletConnectNotification(false);
    trackEvent(MetaMetricsEvents.SIGNATURE_REJECTED, getAnalyticsParams());
  };

  const confirmSignature = async () => {
    if (!isExternalHardwareAccount(messageParams.from)) {
      await onConfirm();
      showWalletConnectNotification(true);
      trackEvent(MetaMetricsEvents.SIGNATURE_APPROVED, getAnalyticsParams());
    } else {
      navigation.navigate(
        ...(await createExternalSignModelNav(
          onReject,
          onConfirm,
          messageParams,
          'personal_sign',
        )),
      );
    }
  };

  // TODO: Replace "any" with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shouldTruncateMessage = (e: any) => {
    if (e.nativeEvent.lines.length > 5) {
      setTruncateMessage(true);
      return;
    }
    setTruncateMessage(false);
  };

  const renderMessageText = () => {
    const textChild = sanitizeString(msgHexToText(messageParams.data))
      .split('\n')
      .map((line: string, i: number) => (
        <Text
          key={`txt_${i}`}
          style={[
            styles.messageText,
            !showExpandedMessage ? styles.textLeft : null,
          ]}
        >
          {line}
          {!showExpandedMessage && '\n'}
        </Text>
      ));
    let messageText;
    if (showExpandedMessage) {
      messageText = textChild;
    } else {
      messageText = truncateMessage ? (
        <Text
          style={styles.messageTextColor}
          numberOfLines={5}
          ellipsizeMode={'tail'}
        >
          {textChild}
        </Text>
      ) : (
        <Text
          style={styles.messageTextColor}
          onTextLayout={shouldTruncateMessage}
        >
          {textChild}
        </Text>
      );
    }
    return messageText;
  };

  const rootView = showExpandedMessage ? (
    <ExpandedMessage
      currentPageInformation={currentPageInformation}
      renderMessage={renderMessageText}
      toggleExpandedMessage={toggleExpandedMessage}
    />
  ) : (
    <SignatureRequest
      navigation={navigation}
      onReject={rejectSignature}
      onConfirm={confirmSignature}
      currentPageInformation={currentPageInformation}
      showExpandedMessage={showExpandedMessage}
      toggleExpandedMessage={toggleExpandedMessage}
      truncateMessage={truncateMessage}
      type="personal_sign"
      fromAddress={messageParams.from}
      origin={messageParams.origin}
      testID={SigningBottomSheetSelectorsIDs.PERSONAL_REQUEST}
    >
      <View style={styles.messageWrapper}>{renderMessageText()}</View>
    </SignatureRequest>
  );
  return rootView;
};

export default PersonalSign;
