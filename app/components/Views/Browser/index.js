import PropTypes from 'prop-types';
import React, { useContext, useEffect, useRef } from 'react';
import { Dimensions, Platform, View } from 'react-native';
import { captureScreen } from 'react-native-view-shot';
import { connect, useSelector } from 'react-redux';
import { strings } from '../../../../locales/i18n';
import { BrowserViewSelectorsIDs } from '../../../../e2e/selectors/Browser/BrowserView.selectors';
import {
  closeAllTabs,
  closeTab,
  createNewTab,
  setActiveTab,
  updateTab,
} from '../../../actions/browser';
import { AvatarAccountType } from '../../../component-library/components/Avatars/Avatar/variants/AvatarAccount';
import {
  ToastContext,
  ToastVariants,
} from '../../../component-library/components/Toast';
import { useAccounts } from '../../../components/hooks/useAccounts';
import { MetaMetricsEvents } from '../../../core/Analytics';
import AppConstants from '../../../core/AppConstants';
import {
  getPermittedAccounts,
  getPermittedAccountsByHostname,
} from '../../../core/Permissions';
import { selectAccountsLength } from '../../../selectors/accountTrackerController';
import { baseStyles } from '../../../styles/common';
import Logger from '../../../util/Logger';
import getAccountNameWithENS from '../../../util/accounts';
import Device from '../../../util/device';
import { useTheme } from '../../../util/theme';
import Tabs from '../../UI/Tabs';
import BrowserTab from '../BrowserTab';

import { isEqual } from 'lodash';
import URL from 'url-parse';
import { useMetrics } from '../../../components/hooks/useMetrics';
import { selectNetworkConfigurations } from '../../../selectors/networkController';
import { getBrowserViewNavbarOptions } from '../../UI/Navbar';
import { selectPermissionControllerState } from '../../../selectors/snaps/permissionController';

const margin = 16;
const THUMB_WIDTH = Dimensions.get('window').width / 2 - margin * 2;
const THUMB_HEIGHT = Device.isIos() ? THUMB_WIDTH * 1.81 : THUMB_WIDTH * 1.48;

/**
 * Component that wraps all the browser
 * individual tabs and the tabs view
 */
export const Browser = (props) => {
  const {
    route,
    navigation,
    createNewTab,
    closeAllTabs: triggerCloseAllTabs,
    closeTab: triggerCloseTab,
    setActiveTab,
    updateTab,
    activeTab: activeTabId,
    tabs,
    accountsLength,
  } = props;
  const previousTabs = useRef(null);
  const { colors } = useTheme();
  const { trackEvent } = useMetrics();
  const { toastRef } = useContext(ToastContext);
  const browserUrl = props.route?.params?.url;
  const linkType = props.route?.params?.linkType;
  const prevSiteHostname = useRef(browserUrl);
  const { accounts, ensByAccountAddress } = useAccounts();
  const accountAvatarType = useSelector((state) =>
    state.settings.useBlockieIcon
      ? AvatarAccountType.Blockies
      : AvatarAccountType.JazzIcon,
  );

  // networkConfigurations has all the rpcs added by the user. We add 1 more to account the Ethereum Main Network
  const nonTestnetNetworks =
    Object.keys(props.networkConfigurations).length + 1;

  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const permittedAccountsList = useSelector((state) => {
    if (!activeTab) return [];

    const permissionsControllerState = selectPermissionControllerState(state);
    const hostname = new URL(activeTab.url).hostname;
    const permittedAcc = getPermittedAccountsByHostname(
      permissionsControllerState,
      hostname,
    );
    return permittedAcc;
  }, isEqual);

  const handleRightTopButtonAnalyticsEvent = () => {
    trackEvent(MetaMetricsEvents.OPEN_DAPP_PERMISSIONS, {
      number_of_accounts: accountsLength,
      number_of_accounts_connected: permittedAccountsList.length,
      number_of_networks: nonTestnetNetworks,
    });
  };

  useEffect(
    () =>
      navigation.setOptions(
        getBrowserViewNavbarOptions(
          route,
          colors,
          handleRightTopButtonAnalyticsEvent,
          !route.params?.showTabs,
        ),
      ),
    /* eslint-disable-next-line */
    [navigation, route, colors],
  );

  const newTab = (url, linkType) => {
    createNewTab(url || AppConstants.HOMEPAGE_URL, linkType);
  };

  const updateTabInfo = (url, tabID) =>
    updateTab(tabID, {
      url,
    });

  const hideTabsAndUpdateUrl = (url) => {
    navigation.setParams({
      ...route.params,
      showTabs: false,
      url,
      silent: false,
    });
  };

  const switchToTab = (tab) => {
    trackEvent(MetaMetricsEvents.BROWSER_SWITCH_TAB, {});
    setActiveTab(tab.id);
    hideTabsAndUpdateUrl(tab.url);
    updateTabInfo(tab.url, tab.id);
  };

  const hasAccounts = useRef(Boolean(accounts.length));

  useEffect(() => {
    const checkIfActiveAccountChanged = async () => {
      const hostname = new URL(browserUrl).hostname;
      const permittedAccounts = await getPermittedAccounts(hostname);
      const activeAccountAddress = permittedAccounts?.[0];
      if (activeAccountAddress) {
        const accountName = getAccountNameWithENS({
          accountAddress: activeAccountAddress,
          accounts,
          ensByAccountAddress,
        });
        // Show active account toast
        toastRef?.current?.showToast({
          variant: ToastVariants.Account,
          labelOptions: [
            {
              label: `${accountName} `,
              isBold: true,
            },
            { label: strings('toast.now_active') },
          ],
          accountAddress: activeAccountAddress,
          accountAvatarType,
        });
      }
    };

    // Handle when the Browser initially mounts and when url changes.
    if (accounts.length && browserUrl) {
      const hostname = new URL(browserUrl).hostname;
      if (prevSiteHostname.current !== hostname || !hasAccounts.current) {
        checkIfActiveAccountChanged();
      }
      hasAccounts.current = true;
      prevSiteHostname.current = hostname;
    }
  }, [browserUrl, accounts, ensByAccountAddress, accountAvatarType, toastRef]);

  // componentDidMount
  useEffect(
    () => {
      const currentUrl = route.params?.newTabUrl;
      const existingTabId = route.params?.existingTabId;
      if (!currentUrl && !existingTabId) {
        // Nothing from deeplink, carry on.
        const activeTab = tabs.find((tab) => tab.id === activeTabId);
        if (activeTab) {
          // Resume where last left off.
          switchToTab(activeTab);
        } else {
          /* eslint-disable-next-line */
          if (tabs.length) {
            // Tabs exists but no active set. Show first tab.
            switchToTab(tabs[0]);
          } else {
            // No tabs. Create a new one.
            newTab();
          }
        }
      }
      // Initialize previous tabs. This prevents the next useEffect block from running the first time.
      previousTabs.current = tabs || [];
    },
    /* eslint-disable-next-line */
    [],
  );

  // Detect when new tab is added and switch to it.
  useEffect(
    () => {
      if (previousTabs.current && tabs.length > previousTabs.current.length) {
        // New tab was added.
        const tabToSwitch = tabs[tabs.length - 1];
        switchToTab(tabToSwitch);
      }
      previousTabs.current = tabs;
    },
    /* eslint-disable-next-line */
    [tabs],
  );

  // Handle links with associated timestamp.
  useEffect(
    () => {
      const newTabUrl = route.params?.newTabUrl;
      const deeplinkTimestamp = route.params?.timestamp;
      const existingTabId = route.params?.existingTabId;
      if (newTabUrl && deeplinkTimestamp) {
        // Open url from link.
        newTab(newTabUrl, linkType);
      } else if (existingTabId) {
        const existingTab = tabs.find((tab) => tab.id === existingTabId);
        if (existingTab) {
          switchToTab(existingTab);
        }
      }
    },
    /* eslint-disable-next-line */
    [
      route.params?.timestamp,
      route.params?.newTabUrl,
      route.params?.existingTabId,
    ],
  );

  const takeScreenshot = (url, tabID) =>
    new Promise((resolve, reject) => {
      captureScreen({
        format: 'jpg',
        quality: 0.2,
        THUMB_WIDTH,
        THUMB_HEIGHT,
      }).then(
        (uri) => {
          updateTab(tabID, {
            url,
            image: uri,
          });
          resolve(true);
        },
        (error) => {
          Logger.error(error, `Error saving tab ${url}`);
          reject(error);
        },
      );
    });

  const showTabs = async () => {
    try {
      const activeTab = tabs.find((tab) => tab.id === activeTabId);
      await takeScreenshot(activeTab.url, activeTab.id);
    } catch (e) {
      Logger.error(e);
    }

    navigation.setParams({
      ...route.params,
      showTabs: true,
    });
  };

  const closeAllTabs = () => {
    if (tabs.length) {
      triggerCloseAllTabs();
      navigation.setParams({
        ...route.params,
        url: null,
        silent: true,
      });
    }
  };

  const closeTab = (tab) => {
    // If the tab was selected we have to select
    // the next one, and if there's no next one,
    // we select the previous one.
    if (tab.id === activeTabId) {
      if (tabs.length > 1) {
        tabs.forEach((t, i) => {
          if (t.id === tab.id) {
            let newTab = tabs[i - 1];
            if (tabs[i + 1]) {
              newTab = tabs[i + 1];
            }
            setActiveTab(newTab.id);
            navigation.setParams({
              ...route.params,
              url: newTab.url,
              silent: true,
            });
          }
        });
      } else {
        navigation.setParams({
          ...route.params,
          url: null,
          silent: true,
        });
      }
    }

    triggerCloseTab(tab.id);
  };

  const closeTabsView = () => {
    if (tabs.length) {
      navigation.setParams({
        ...route.params,
        showTabs: false,
        silent: true,
      });
    }
  };

  const renderTabsView = () => {
    const showTabs = route.params?.showTabs;
    if (showTabs) {
      return (
        <Tabs
          tabs={tabs}
          activeTab={activeTabId}
          switchToTab={switchToTab}
          newTab={newTab}
          closeTab={closeTab}
          closeTabsView={closeTabsView}
          closeAllTabs={closeAllTabs}
        />
      );
    }
    return null;
  };

  const renderBrowserTabs = () =>
    tabs.map((tab) => (
      <BrowserTab
        id={tab.id}
        key={`tab_${tab.id}`}
        initialUrl={tab.url || AppConstants.HOMEPAGE_URL}
        linkType={tab.linkType}
        updateTabInfo={updateTabInfo}
        showTabs={showTabs}
        newTab={newTab}
      />
    ));

  return (
    <View
      style={baseStyles.flexGrow}
      testID={BrowserViewSelectorsIDs.BROWSER_SCREEN_ID}
    >
      {renderBrowserTabs()}
      {renderTabsView()}
    </View>
  );
};

const mapStateToProps = (state) => ({
  accountsLength: selectAccountsLength(state),
  networkConfigurations: selectNetworkConfigurations(state),
  tabs: state.browser.tabs,
  activeTab: state.browser.activeTab,
});

const mapDispatchToProps = (dispatch) => ({
  createNewTab: (url, linkType) => dispatch(createNewTab(url, linkType)),
  closeAllTabs: () => dispatch(closeAllTabs()),
  closeTab: (id) => dispatch(closeTab(id)),
  setActiveTab: (id) => dispatch(setActiveTab(id)),
  updateTab: (id, url) => dispatch(updateTab(id, url)),
});

Browser.propTypes = {
  /**
   * react-navigation object used to switch between screens
   */
  navigation: PropTypes.object,
  /**
   * Function to create a new tab
   */
  createNewTab: PropTypes.func,
  /**
   * Function to close all the existing tabs
   */
  closeAllTabs: PropTypes.func,
  /**
   * Function to close a specific tab
   */
  closeTab: PropTypes.func,
  /**
   * Function to set the active tab
   */
  setActiveTab: PropTypes.func,
  /**
   * Function to set the update the url of a tab
   */
  updateTab: PropTypes.func,
  /**
   * Array of tabs
   */
  tabs: PropTypes.array,
  /**
   * ID of the active tab
   */
  activeTab: PropTypes.number,
  /**
   * Object that represents the current route info like params passed to it
   */
  route: PropTypes.object,
  accountsLength: PropTypes.number,
  networkConfigurations: PropTypes.object,
};

export { default as createBrowserNavDetails } from './Browser.types';

export default connect(mapStateToProps, mapDispatchToProps)(Browser);
