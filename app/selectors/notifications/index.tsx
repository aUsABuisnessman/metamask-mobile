import { createSelector } from 'reselect';

import { TRIGGER_TYPES, Notification } from '../../util/notifications';

import { createDeepEqualSelector } from '../util';
import { RootState } from '../../reducers';
import { NotificationServicesController } from '@metamask/notification-services-controller';
import {
  AuthenticationController,
  UserStorageController,
} from '@metamask/profile-sync-controller';

type NotificationServicesState =
  NotificationServicesController.NotificationServicesControllerState;
type AuthenticationState =
  AuthenticationController.AuthenticationControllerState;
type UserStorageState = UserStorageController.UserStorageControllerState;

const selectAuthenticationControllerState = (state: RootState) =>
  state?.engine?.backgroundState?.AuthenticationController;

const selectUserStorageControllerState = (state: RootState) =>
  state?.engine?.backgroundState?.UserStorageController;

const selectNotificationServicesControllerState = (state: RootState) =>
  state?.engine?.backgroundState?.NotificationServicesController;

export const selectIsProfileSyncingEnabled = createSelector(
  selectUserStorageControllerState,
  (userStorageControllerState: UserStorageState) =>
    userStorageControllerState.isProfileSyncingEnabled,
);
export const selectIsProfileSyncingUpdateLoading = createSelector(
  selectUserStorageControllerState,
  (userStorageControllerState: UserStorageState) =>
    userStorageControllerState.isProfileSyncingUpdateLoading,
);

export const selectIsSignedIn = createSelector(
  selectAuthenticationControllerState,
  (authenticationControllerState: AuthenticationState) =>
    authenticationControllerState.isSignedIn,
);

export const selectSessionData = createSelector(
  selectAuthenticationControllerState,
  (authenticationControllerState: AuthenticationState) =>
    authenticationControllerState.sessionData,
);

export const selectIsMetamaskNotificationsEnabled = createSelector(
  selectNotificationServicesControllerState,
  (notificationServicesControllerState: NotificationServicesState) =>
    notificationServicesControllerState.isNotificationServicesEnabled,
);
export const selectIsMetamaskNotificationsFeatureSeen = createSelector(
  selectNotificationServicesControllerState,
  (notificationServicesControllerState: NotificationServicesState) =>
    notificationServicesControllerState.isMetamaskNotificationsFeatureSeen,
);
export const selectIsUpdatingMetamaskNotifications = createSelector(
  selectNotificationServicesControllerState,
  (notificationServicesControllerState: NotificationServicesState) =>
    notificationServicesControllerState.isUpdatingMetamaskNotifications,
);
export const selectIsFetchingMetamaskNotifications = createSelector(
  selectNotificationServicesControllerState,
  (notificationServicesControllerState: NotificationServicesState) =>
    notificationServicesControllerState.isFetchingMetamaskNotifications,
);
export const selectIsFeatureAnnouncementsEnabled = createSelector(
  selectNotificationServicesControllerState,
  (notificationServicesControllerState: NotificationServicesState) =>
    notificationServicesControllerState.isFeatureAnnouncementsEnabled,
);
export const selectIsUpdatingMetamaskNotificationsAccount = createSelector(
  selectNotificationServicesControllerState,
  (notificationServicesControllerState: NotificationServicesState) =>
    notificationServicesControllerState.isUpdatingMetamaskNotificationsAccount,
);
export const selectIsCheckingAccountsPresence = createSelector(
  selectNotificationServicesControllerState,
  (notificationServicesControllerState: NotificationServicesState) =>
    notificationServicesControllerState.isCheckingAccountsPresence,
);
export const getmetamaskNotificationsReadList = createSelector(
  selectNotificationServicesControllerState,
  (notificationServicesControllerState: NotificationServicesState) =>
    notificationServicesControllerState.metamaskNotificationsReadList,
);
export const getNotificationsList = createDeepEqualSelector(
  selectNotificationServicesControllerState,
  (notificationServicesControllerState: NotificationServicesState) =>
    notificationServicesControllerState.metamaskNotificationsList,
);

export const getMetamaskNotificationsUnreadCount = createSelector(
  selectNotificationServicesControllerState,
  (notificationServicesControllerState: NotificationServicesState) =>
    (
      notificationServicesControllerState.metamaskNotificationsList ?? []
    ).filter((notification: Notification) => !notification.isRead).length,
);
export const getMetamaskNotificationsReadCount = createSelector(
  selectNotificationServicesControllerState,
  (notificationServicesControllerState: NotificationServicesState) =>
    (
      notificationServicesControllerState.metamaskNotificationsList ?? []
    ).filter((notification: Notification) => notification.isRead).length,
);
export const getOnChainMetamaskNotificationsUnreadCount = createSelector(
  selectNotificationServicesControllerState,
  (notificationServicesControllerState: NotificationServicesState) =>
    (
      notificationServicesControllerState.metamaskNotificationsList ?? []
    ).filter(
      (notification: Notification) =>
        !notification.isRead &&
        notification.type !== TRIGGER_TYPES.FEATURES_ANNOUNCEMENT,
    ).length,
);
