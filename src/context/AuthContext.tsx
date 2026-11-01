import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  User,
  MaintenanceState,
  PopupMessage,
  PopupType,
  BannerConfig,
  SongRequest,
  SongRequestStatus,
  UserAccentColor,
} from '../types';
import { storage } from '../services/storage';

interface AuthContextType {
  currentUser: User | null;
  isAdmin: boolean;
  maintenanceState: MaintenanceState;
  bannerConfig: BannerConfig;
  updateBannerConfig: (updates: Partial<BannerConfig>) => void;
  login: (username: string, pass: string) => Promise<{ success: boolean; user?: User; error?: string }>;
  logout: () => void;
  checkUserApproval: (userId: string) => Promise<User | null>;
  requestAccount: (username: string, pass: string, note: string) => Promise<{ success: boolean; error?: string }>;
  changeOwnPassword: (currentPass: string, newPass: string) => Promise<{ success: boolean; error?: string }>;
  activePopups: PopupMessage[];
  dismissPopup: (popupId: string, permanent?: boolean) => void;
  refreshState: () => void;

  // Song Requests
  songRequests: SongRequest[];
  submitSongRequest: (data: {
    songTitle: string;
    artist?: string;
    webLink?: string;
    coverUrl?: string;
    notes?: string;
    requestType?: 'song' | 'feature';
    featureCategory?: string;
    genre?: string;
  }) => Promise<SongRequest>;
  updateSongRequestStatus: (id: string, status: SongRequestStatus, adminNote?: string) => void;
  deleteSongRequest: (id: string, keepSong?: boolean) => void;
  adminUpdateRequest: (id: string, updates: Partial<SongRequest>) => Promise<SongRequest | null>;
  adminPublishRequest: (id: string, isPublished: boolean, hideVideo?: boolean) => Promise<{ success: boolean; request?: SongRequest; error?: string }>;

  // Admin actions
  allUsers: User[];
  allPopups: PopupMessage[];
  approveAccount: (userId: string) => void;
  rejectAccount: (userId: string, reason?: string) => void;
  setUserAccent: (accent: UserAccentColor) => Promise<boolean>;
  adminUpdateUser: (
    userId: string,
    paramsOrUsername?:
      | {
          newUsername?: string;
          newPassword?: string;
          role?: 'admin' | 'user';
          isApproved?: boolean;
          chatBlocked?: boolean;
          isSuspended?: boolean;
          suspendedReason?: string;
          adminNote?: string;
          colorAccent?: string;
          dailyListenLimit?: number | null;
          isLocked?: boolean;
          christmasMode?: boolean;
        }
      | string,
    newPassword?: string
  ) => Promise<{ success: boolean; error?: string }>;
  adminDeleteUser: (userId: string) => void;
  setMaintenance: (
    enabled: boolean,
    message?: string,
    hasCountdown?: boolean,
    estimatedFinishTime?: string | null,
    autoDisableOnCountdown?: boolean,
    tabMaintenance?: MaintenanceState['tabMaintenance']
  ) => void;
  createBroadcastPopup: (
    targetUserId: string,
    title: string,
    message: string,
    type?: PopupType,
    durationMinutes?: number,
    isDismissible?: boolean
  ) => void;
  revokePopup: (popupId: string) => void;
  deletePopup: (popupId: string) => void;
  unreadChatCount: number;
  markChatsRead: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => storage.getCurrentSessionUser());
  const [maintenanceState, setMaintenanceState] = useState<MaintenanceState>(() => storage.getMaintenanceState());
  const [bannerConfig, setBannerConfig] = useState<BannerConfig>(() => storage.getBanner());
  const [songRequests, setSongRequests] = useState<SongRequest[]>(() => storage.getRequests());
  const [allUsers, setAllUsers] = useState<User[]>(() => storage.getUsers());
  const [allPopups, setAllPopups] = useState<PopupMessage[]>(() => storage.getAllPopups());
  const [activePopups, setActivePopups] = useState<PopupMessage[]>([]);

  const refreshState = useCallback(() => {
    const liveUser = storage.getCurrentSessionUser();
    setCurrentUser(liveUser);
    setMaintenanceState(storage.getMaintenanceState());
    setBannerConfig(storage.getBanner());
    setSongRequests(storage.getRequests());
    setAllUsers(storage.getUsers());
    setAllPopups(storage.getAllPopups());

    const unreadPopups = storage.getActivePopupsForUser(liveUser?.id);
    setActivePopups((prev) => {
      const prevIds = prev.map((p) => p.id).sort().join(',');
      const nextIds = unreadPopups.map((p) => p.id).sort().join(',');
      return prevIds === nextIds ? prev : unreadPopups;
    });
  }, []);

  useEffect(() => {
    refreshState();
    const unsubscribe = storage.subscribe(() => {
      refreshState();
    });
    const interval = setInterval(() => {
      storage.syncWithServer();
    }, 15000);
    const statusInterval = setInterval(() => { void storage.refreshSessionStatus(); }, 3000);
    const expInterval = setInterval(() => {
      const liveUser = storage.getCurrentSessionUser();
      const currentActive = storage.getActivePopupsForUser(liveUser?.id);
      setActivePopups((prev) => {
        const prevIds = prev.map((p) => p.id).sort().join(',');
        const nextIds = currentActive.map((p) => p.id).sort().join(',');
        return prevIds === nextIds ? prev : currentActive;
      });
    }, 2000);
    return () => {
      unsubscribe();
      clearInterval(interval);
      clearInterval(statusInterval);
      clearInterval(expInterval);
    };
  }, [refreshState]);

  // Synchronize Personal Color Accent to document attribute
  useEffect(() => {
    const accent = currentUser?.colorAccent || 'blue';
    document.documentElement.setAttribute('data-accent', accent);
  }, [currentUser?.colorAccent]);

  const login = async (username: string, pass: string) => {
    const res = await storage.login(username, pass);
    if (res.success && res.user) {
      setCurrentUser(res.user);
      refreshState();
      // Load the library, playlists, requests and settings for the new session right away,
      // so everything is there as soon as the login screen disappears (no refresh needed).
      try {
        await Promise.race([storage.syncWithServer(), new Promise((resolve) => setTimeout(resolve, 5000))]);
      } catch (_) {}
      refreshState();
      // One more pass shortly after, in case the first answers were still on their way
      setTimeout(() => {
        storage.syncWithServer().then(refreshState).catch(() => {});
      }, 1500);
    }
    return res;
  };

  const logout = () => {
    // Ends the server-side session (clears the secure cookie)
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    storage.setCurrentSessionUser(null);
    setCurrentUser(null);
    refreshState();
  };

  const checkUserApproval = async (userId: string) => {
    const updated = await storage.checkUserApproval(userId);
    if (updated) {
      setCurrentUser(updated);
      refreshState();
    }
    return updated;
  };

  const requestAccount = async (username: string, pass: string, note: string) => {
    const res = await storage.requestAccount(username, pass, note);
    if (res.success) {
      refreshState();
    }
    return res;
  };

  const changeOwnPassword = async (currentPass: string, newPass: string) => {
    if (!currentUser) return { success: false, error: 'Not logged in' };
    const res = await storage.changeOwnPassword(currentUser.id, currentPass, newPass);
    if (res.success) {
      setCurrentUser((prev) => (prev ? { ...prev, temporaryPasswordAssigned: false } : null));
      refreshState();
    }
    return res;
  };

  const dismissPopup = (popupId: string, permanent: boolean = false) => {
    storage.dismissPopup(popupId, currentUser?.id, permanent);
    setActivePopups((prev) => prev.filter((p) => p.id !== popupId));
  };

  const updateBannerConfig = async (updates: Partial<BannerConfig>) => {
    const updated = await storage.updateBanner(updates);
    setBannerConfig(updated);
  };

  const submitSongRequest = async (data: {
    songTitle: string;
    artist?: string;
    webLink?: string;
    coverUrl?: string;
    notes?: string;
    requestType?: 'song' | 'feature';
    featureCategory?: string;
    genre?: string;
  }) => {
    const newReq = await storage.createRequest({
      ...data,
      requestedByUserId: currentUser?.id,
      requestedByUsername: currentUser?.username || 'Guest User',
    });
    setSongRequests(storage.getRequests());
    return newReq;
  };

  const updateSongRequestStatus = async (id: string, status: SongRequestStatus, adminNote?: string) => {
    await storage.updateRequestStatus(id, status, adminNote);
    setSongRequests(storage.getRequests());
  };

  const deleteSongRequest = async (id: string, keepSong: boolean = false) => {
    await storage.deleteRequest(id, keepSong);
    setSongRequests(storage.getRequests());
  };

  const adminUpdateRequest = async (id: string, updates: Partial<SongRequest>) => {
    const updated = await storage.adminUpdateRequest(id, updates);
    setSongRequests(storage.getRequests());
    return updated;
  };

  const adminPublishRequest = async (id: string, isPublished: boolean, hideVideo: boolean = false) => {
    const result = await storage.adminPublishRequest(id, isPublished, hideVideo);
    setSongRequests(storage.getRequests());
    return result;
  };

  // Admin controls
  const approveAccount = async (userId: string) => {
    await storage.approveAccount(userId);
    refreshState();
  };

  const rejectAccount = async (userId: string, reason?: string) => {
    await storage.rejectAccount(userId, reason);
    refreshState();
  };

  const setUserAccent = async (accent: UserAccentColor) => {
    if (!currentUser) return false;
    const ok = await storage.updateUserAccent(currentUser.id, accent);
    if (ok) {
      setCurrentUser((prev) => (prev ? { ...prev, colorAccent: accent } : null));
    }
    return ok;
  };

  const adminUpdateUser = async (
    userId: string,
    paramsOrUsername?:
      | {
          newUsername?: string;
          newPassword?: string;
          role?: 'admin' | 'user';
          isApproved?: boolean;
          chatBlocked?: boolean;
          isSuspended?: boolean;
          suspendedReason?: string;
          adminNote?: string;
          colorAccent?: string;
          dailyListenLimit?: number | null;
          isLocked?: boolean;
          christmasMode?: boolean;
        }
      | string,
    newPassword?: string
  ) => {
    let params: {
      newUsername?: string;
      newTemporaryPassword?: string;
      role?: 'admin' | 'user';
      isApproved?: boolean;
      chatBlocked?: boolean;
      isSuspended?: boolean;
      suspendedReason?: string;
      adminNote?: string;
      colorAccent?: string;
      dailyListenLimit?: number | null;
      isLocked?: boolean;
      christmasMode?: boolean;
    };

    if (typeof paramsOrUsername === 'object' && paramsOrUsername !== null) {
      params = {
        newUsername: paramsOrUsername.newUsername,
        newTemporaryPassword: paramsOrUsername.newPassword,
        role: paramsOrUsername.role,
        isApproved: paramsOrUsername.isApproved,
        chatBlocked: paramsOrUsername.chatBlocked,
        isSuspended: paramsOrUsername.isSuspended,
        suspendedReason: paramsOrUsername.suspendedReason,
        adminNote: paramsOrUsername.adminNote,
        colorAccent: paramsOrUsername.colorAccent,
        dailyListenLimit: paramsOrUsername.dailyListenLimit,
        isLocked: paramsOrUsername.isLocked,
        christmasMode: paramsOrUsername.christmasMode,
      };
    } else {
      params = {
        newUsername: paramsOrUsername,
        newTemporaryPassword: newPassword,
      };
    }

    const res = await storage.adminUpdateUser(userId, params);
    if (res.success) {
      refreshState();
    }
    return res;
  };

  const adminDeleteUser = async (userId: string) => {
    await storage.deleteUser(userId);
    refreshState();
  };

  const setMaintenance = async (
    enabled: boolean,
    message?: string,
    hasCountdown?: boolean,
    estimatedFinishTime?: string | null,
    autoDisableOnCountdown?: boolean,
    tabMaintenance?: MaintenanceState['tabMaintenance']
  ) => {
    const updated = await storage.setMaintenanceState(
      enabled,
      message,
      hasCountdown,
      estimatedFinishTime,
      autoDisableOnCountdown,
      tabMaintenance
    );
    setMaintenanceState(updated);
    refreshState();
  };

  const createBroadcastPopup = async (
    targetUserId: string,
    title: string,
    message: string,
    type: PopupType = 'announcement',
    durationMinutes?: number,
    isDismissible?: boolean
  ) => {
    await storage.createPopup(targetUserId, title, message, type, durationMinutes, isDismissible);
    refreshState();
  };

  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);

  useEffect(() => {
    if (!currentUser) {
      setUnreadChatCount(0);
      return;
    }

    const checkUnread = async () => {
      try {
        const thrs = await storage.getChatThreads(currentUser.id);
        const lastReadTime = localStorage.getItem(`yousong_chat_read_${currentUser.id}`) || '0';
        let count = 0;
        thrs.forEach((th) => {
          if (
            th.lastMessageAt &&
            new Date(th.lastMessageAt).getTime() > Number(lastReadTime) &&
            th.lastMessageSender &&
            th.lastMessageSender !== currentUser.username
          ) {
            count++;
          }
        });
        setUnreadChatCount(count);
      } catch {}
    };

    checkUnread();
    const interval = setInterval(checkUnread, 4000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const markChatsRead = () => {
    if (currentUser) {
      localStorage.setItem(`yousong_chat_read_${currentUser.id}`, Date.now().toString());
      setUnreadChatCount(0);
    }
  };

  const revokePopup = async (popupId: string) => {
    await storage.revokePopup(popupId);
    refreshState();
  };

  const deletePopup = async (popupId: string) => {
    await storage.deletePopup(popupId);
    refreshState();
  };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAdmin,
        maintenanceState,
        bannerConfig,
        updateBannerConfig,
        login,
        logout,
        checkUserApproval,
        requestAccount,
        changeOwnPassword,
        activePopups,
        dismissPopup,
        refreshState,
        songRequests,
        submitSongRequest,
        updateSongRequestStatus,
        deleteSongRequest,
        adminUpdateRequest,
        adminPublishRequest,
        allUsers,
        allPopups,
        approveAccount,
        rejectAccount,
        setUserAccent,
        adminUpdateUser,
        adminDeleteUser,
        setMaintenance,
        createBroadcastPopup,
        revokePopup,
        deletePopup,
        unreadChatCount,
        markChatsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
