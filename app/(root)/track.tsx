// Suppress Reanimated strict mode warning in this file only

if (__DEV__ && (global as any)._REANIMATED_VERSION_3) {
  // @ts-ignore
  global.__reanimatedWorkletInit = () => {};
}

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator, Alert, FlatList, Image, Dimensions, Modal, TextInput, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { router } from 'expo-router';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, setDoc, getDocs, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MaterialIcons, AntDesign, MaterialCommunityIcons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useLanguage } from '@/context/LanguageContext';
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { icons } from '@/constants';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Header from '@/components/Header';
import * as Notifications from 'expo-notifications';
import { sendLocationUpdateNotification, sendLocationShareNotification } from '@/lib/notifications';
import { Animated } from 'react-native';

// Types
interface AppUser {
  id: string;
  name: string;
  email: string;
  profile_image?: string;
}

interface Share {
  recipient_id: string;
  sharer_id: string;
  latitude: number;
  longitude: number;
  last_updated: string;
  is_active: boolean;
  docId?: string;
}

interface UserLocation {
  latitude: number;
  longitude: number;
}

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
}

const CustomAlert = ({ 
  visible, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmText = 'OK',
  cancelText = 'Cancel',
  type = 'info'
}: CustomAlertProps) => {
  const { language } = useLanguage();
  const isRTL = language === 'ar';
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 7
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true
        })
      ]).start();
    }
  }, [visible]);

  const handleConfirm = () => {
    onConfirm();
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          icon: 'check-circle',
          color: '#22c55e',
          bgColor: '#dcfce7'
        };
      case 'error':
        return {
          icon: 'error',
          color: '#ef4444',
          bgColor: '#fee2e2'
        };
      case 'warning':
        return {
          icon: 'warning',
          color: '#f97316',
          bgColor: '#ffedd5'
        };
      default:
        return {
          icon: 'info',
          color: '#3b82f6',
          bgColor: '#dbeafe'
        };
    }
  };

  const typeStyles = getTypeStyles();

  if (!visible) return null;

  return (
    <View style={styles.alertRoot}>
      <TouchableOpacity 
        style={styles.alertOverlay}
        activeOpacity={1}
        onPress={handleCancel}
      >
        <TouchableOpacity 
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={styles.alertContent}
        >
          <Animated.View 
            style={[
              styles.alertContainer,
              { transform: [{ scale: scaleAnim }] },
              { opacity: opacityAnim }
            ]}
          >
           <View className={`p-6 ${typeStyles.bgColor}`}>
          <View className="items-center mb-4">
            <MaterialIcons name={typeStyles.icon as any} size={48} color={typeStyles.color} />
          </View>
          <Text className="text-xl font-CairoBold text-gray-800 text-center mb-2">
            {title}
          </Text>
          <Text className="text-base text-gray-600 text-center font-CairoRegular">
            {message}
          </Text>
        </View>
            
            <View style={[
              styles.alertButtons,
              { flexDirection: isRTL ? 'row-reverse' : 'row' }
            ]}>
              {onCancel && (
                <TouchableOpacity
                  onPress={handleCancel}
                  style={[
                    styles.alertCancelButton,
                    isRTL ? styles.alertCancelButtonRTL : styles.alertCancelButtonLTR
                  ]}
                >
                  <Text style={[
                    styles.alertCancelButtonText,
                    { fontFamily: isRTL ? 'CairoMedium' : 'System' }
                  ]}>
                    {cancelText}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleConfirm}
                style={[
                  styles.alertConfirmButton,
                  { backgroundColor: typeStyles.color },
                  onCancel ? { flex: 1 } : { width: '100%' }
                ]}
              >
                <Text style={[
                  styles.alertConfirmButtonText,
                  { fontFamily: isRTL ? 'CairoMedium' : 'System' }
                ]}>
                  {confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
};

export default function Track() {
  // Context and state
  const { user } = useUser();
  const { language } = useLanguage();
  const isRTL = language === 'ar';
  const mapRef = useRef<MapView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  
  // State
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [now, setNow] = useState(new Date());
  const [selectedLocation, setSelectedLocation] = useState<{latitude: number, longitude: number, title: string} | null>(null);
  const [trackRequests, setTrackRequests] = useState<any[]>([]);
  const [myShares, setMyShares] = useState<any[]>([]);
  const [activeModal, setActiveModal] = useState<'none' | 'search' | 'shares'>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AppUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [isLocationSharing, setIsLocationSharing] = useState(false);
  const [trackingInterval, setTrackingInterval] = useState<NodeJS.Timeout | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showMyShares, setShowMyShares] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [stoppingShares, setStoppingShares] = useState<Set<string>>(new Set());
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onConfirm: () => void;
    confirmText?: string;
    onCancel?: () => void;
    cancelText?: string;
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {},
  });

  // Timer for updating times
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Get user's location
  useEffect(() => {
    const getLocation = async () => {
      try {
        setIsInitialLoading(true);
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setAlertConfig({
            visible: true,
            title: isRTL ? 'تنبيه الموقع' : 'Location Alert',
            message: isRTL ? 'يجب منح إذن للوصول إلى الموقع لاستخدام ميزات التتبع' : 'Location permission is required to use the tracking features.',
            type: 'warning',
            onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
            confirmText: isRTL ? 'حسنا' : 'OK'
          });
          return;
        }
        
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude
        });
      } catch (error) {
        console.error('Error getting location:', error);
        setAlertConfig({
          visible: true,
          title: isRTL ? 'خطأ في الموقع' : 'Location Error',
          message: isRTL ? 'حدث خطأ أثناء محاولة الحصول على موقعك' : 'An error occurred while trying to get your location',
          type: 'error',
          onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
          confirmText: isRTL ? 'حسنا' : 'OK'
        });
      } finally {
        setIsInitialLoading(false);
        setLoading(false);
      }
    };
    
    getLocation();
  }, []);

  // Load track requests
  useEffect(() => {
    if (!user?.id) return;
    
    const q = query(
      collection(db, 'location_sharing'),
      where('recipient_id', '==', user.id),
      where('is_active', '==', true)
    );
    
    const unsub = onSnapshot(q, async (snapshot) => {
      const requests: any[] = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as Share;
        const sharerDoc = await getDoc(doc(db, 'users', data.sharer_id));
        
        // Only add the request if the sharer has a Firebase account
        if (sharerDoc.exists()) {
          const sharerData = sharerDoc.data();
          const sharer = {
            id: data.sharer_id,
            name: sharerData.name || sharerData.email || 'User',
            email: sharerData.email,
            profile_image: sharerData.profile_image_url 
          };
          
          requests.push({ ...data, sharer, docId: docSnap.id });
        }
      }
      
      setTrackRequests(requests);
      setLoading(false);
    });
    
    return () => unsub();
  }, [user?.id]);

  // Load my shares
  useEffect(() => {
    if (!user?.id) return;
    
    const q = query(
      collection(db, 'location_sharing'),
      where('sharer_id', '==', user.id),
      where('is_active', '==', true)
    );
    
    const unsub = onSnapshot(q, async (snapshot) => {
      const shares: any[] = [];
      
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as Share;
        const recipientDoc = await getDoc(doc(db, 'users', data.recipient_id));
        let recipient = {
          id: data.recipient_id,
          name: 'Unknown User',
          email: '',
          profile_image: undefined
        };
                  
        if (recipientDoc.exists()) {
          const recipientData = recipientDoc.data();
          recipient = {
            id: data.recipient_id,
            name: recipientData.name || recipientData.email || 'User',
            email: recipientData.email,
            profile_image: recipientData.profile_image_url
          };
        }
        
        shares.push({ ...data, recipient, docId: docSnap.id });
      }
      
      setMyShares(shares);
    });
    
    return () => unsub();
  }, [user?.id]);

  // Load users for sharing
  useEffect(() => {
    if (!user?.id) return;
    
    const fetchAppUsers = async () => {
      try {
        const usersRef = collection(db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        const usersList: AppUser[] = [];
        
        // Get all active shares where current user is the sharer
        const sharesQuery = query(
          collection(db, 'location_sharing'),
          where('sharer_id', '==', user.id),
          where('is_active', '==', true)
        );
        const sharesSnapshot = await getDocs(sharesQuery);
        const activeRecipients = new Set(sharesSnapshot.docs.map(doc => doc.data().recipient_id));
        
        // Filter out users that are already in active shares
        usersSnapshot.forEach(doc => {
          if (doc.id !== user.id && !activeRecipients.has(doc.id)) {
            const userData = doc.data();
            usersList.push({
              id: doc.id,
              name: userData.name || userData.email || 'User',
              email: userData.email,
              profile_image: userData.profile_image_url
            });
          }
        });
        
        setAppUsers(usersList);
        setFilteredUsers(usersList);
      } catch (error) {
        console.error('Error fetching app users:', error);
        setAlertConfig({
          visible: true,
          title: isRTL ? 'خطأ' : 'Error',
          message: isRTL ? 'حدث خطأ أثناء تحميل قائمة المستخدمين' : 'An error occurred while loading users list',
          type: 'error',
          onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
          confirmText: isRTL ? 'حسنا' : 'OK'
        });
      }
    };

    fetchAppUsers();
  }, [user?.id, myShares]);

  // Filter users based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredUsers(appUsers);
    } else {
      const filtered = appUsers.filter(user => 
        (user.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (user.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
      );
      setFilteredUsers(filtered);
    }
  }, [searchQuery, appUsers]);

  // Format elapsed time
  const formatTimeElapsed = (timestamp: string) => {
    if (!timestamp) return isRTL ? "لم يتم التحديث" : "Never";
    
    const lastUpdated = new Date(timestamp);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - lastUpdated.getTime()) / 1000);
    
    if (seconds < 60) {
      return isRTL 
        ? `منذ ${seconds} ثانية${seconds !== 1 ? '' : 'ة'}`
        : `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return isRTL
        ? `منذ ${minutes} دقيقة${minutes !== 1 ? '' : ''}`
        : `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else {
      return isRTL
        ? lastUpdated.toLocaleTimeString('ar-SA')
        : lastUpdated.toLocaleTimeString();
    }
  };

  // Stop sharing location with a recipient
  const stopSharing = async (docId: string) => {
    try {
      setStoppingShares(prev => new Set(prev).add(docId));
      await updateDoc(doc(db, 'location_sharing', docId), { is_active: false });
      const stoppedShare = myShares.find(share => share.docId === docId);
      const recipientName = stoppedShare?.recipient?.name || (isRTL ? 'المستخدم' : 'the user');
      
      // Clear tracking interval if this was the last active share
      const remainingShares = myShares.filter(share => share.docId !== docId && share.is_active);
      if (remainingShares.length === 0 && trackingInterval) {
        clearInterval(trackingInterval);
        setTrackingInterval(null);
        setIsLocationSharing(false);
      }
      
      setAlertConfig({
        visible: true,
        title: isRTL ? 'تم الايقاف' : 'Stopped',
        message: isRTL ? `تم إيقاف مشاركة الموقع مع ${recipientName}` : `Location sharing stopped with ${recipientName}`,
        type: 'success',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: isRTL ? 'حسنا' : 'OK'
      });
    } catch (error) {
      console.error('Error stopping sharing:', error);
      setAlertConfig({
        visible: true,
        title: isRTL ? 'خطأ' : 'Error',
        message: isRTL ? 'فشل في إيقاف مشاركة الموقع' : 'Could not stop sharing location',
        type: 'error',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: isRTL ? 'حسنا' : 'OK'
      });
    } finally {
      setStoppingShares(prev => {
        const newSet = new Set(prev);
        newSet.delete(docId);
        return newSet;
      });
    }
  };

  // View a sharer's location
  const viewSharerLocation = (share: any) => {
    setSelectedLocation({
      latitude: share.latitude,
      longitude: share.longitude,
      title: share.sharer.name
    });
    
    // Center map on the selected location
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: share.latitude,
        longitude: share.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01
      }, 1000);
    }

    // Close bottom sheet
    bottomSheetRef.current?.collapse();
  };

  // Update user location and shared location if sharing
  const fetchUserLocation = async () => {
    try {
      setIsRefreshing(true);
      
      // Request location permissions
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setAlertConfig({
          visible: true,
          title: isRTL ? 'تنبيه الموقع' : 'Location Alert',
          message: isRTL ? 'يجب منح إذن للوصول إلى الموقع لاستخدام ميزات التتبع' : 'Location permission is required to use the tracking features.',
          type: 'warning',
          onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
          confirmText: isRTL ? 'حسنا' : 'OK'
        });
        setIsRefreshing(false);
        return;
      }

      // Get current location with timeout
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest
      });
      
      // Set a timeout of 10 seconds
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Location request timed out')), 10000);
      });
      
      // Race between location request and timeout
      const location = await Promise.race([locationPromise, timeoutPromise]) as Location.LocationObject;
      
      // Update user location state
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });
      
      // Center map on user's location
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01
        }, 1000);
      }

      // Update shared location if actively sharing
      if (isLocationSharing && selectedUser && user?.id) {
        await updateSharedLocation(location.coords.latitude, location.coords.longitude);
      }
      
      setIsRefreshing(false);
      setLoading(false);
    } catch (error) {
      console.error('Error getting location:', error);
      setAlertConfig({
        visible: true,
        title: isRTL ? 'خطأ في الموقع' : 'Location Error',
        message: isRTL ? 'حدث خطأ أثناء محاولة الحصول على موقعك' : 'An error occurred while trying to get your location',
        type: 'error',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: isRTL ? 'حسنا' : 'OK'
      });
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  // Handle notification press
  const handleNotification = (notification: Notifications.NotificationResponse) => {
    const data = notification.notification.request.content.data;
    
    if (data.type === 'location_share' || data.type === 'location_update') {
      // Navigate to track user page
      router.push(`/track-user/${data.sharerId}`);
    }
  };

  // Set up notification response listener
  useEffect(() => {
    const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotification(response);
    });

    return () => {
      Notifications.removeNotificationSubscription(responseListener);
    };
  }, []);

  // Update shared location in Firestore
  const updateSharedLocation = async (latitude: number, longitude: number) => {
    if (!user?.id || !selectedUser) return;
    
    try {
      const currentTime = new Date().toISOString();
      
      // Get all active shares where current user is the sharer
      const sharesQuery = query(
        collection(db, 'location_sharing'),
        where('sharer_id', '==', user.id),
        where('is_active', '==', true)
      );
      const sharesSnapshot = await getDocs(sharesQuery);
      
      // Update location for each active share
      const updatePromises = sharesSnapshot.docs.map(async (docSnapshot) => {
        const shareData = docSnapshot.data();
        await updateDoc(doc(db, 'location_sharing', docSnapshot.id), {
          latitude,
          longitude,
          last_updated: currentTime
        });

        // Send notification to recipient
        await sendLocationUpdateNotification(
          shareData.recipient_id,
          user?.fullName || (isRTL ? 'مستخدم' : 'A user'),
          isRTL,
          user.id
        );
      });

      await Promise.all(updatePromises);

      // Update user's own location state
      setUserLocation({
        latitude,
        longitude
      });

      // Force refresh the track requests to update timestamps
      const refreshQuery = query(
        collection(db, 'location_sharing'),
        where('recipient_id', '==', user.id),
        where('is_active', '==', true)
      );
      
      const refreshSnapshot = await getDocs(refreshQuery);
      const requests: any[] = [];
      
      for (const docSnap of refreshSnapshot.docs) {
        const data = docSnap.data() as Share;
        const sharerDoc = await getDoc(doc(db, 'users', data.sharer_id));
        
        if (sharerDoc.exists()) {
          const sharerData = sharerDoc.data();
          const sharer = {
            id: data.sharer_id,
            name: sharerData.name || sharerData.email || 'User',
            email: sharerData.email,
            profile_image: sharerData.profile_image_url 
          };
          
          requests.push({ ...data, sharer, docId: docSnap.id });
        }
      }
      
      setTrackRequests(requests);

      // Center map on new location
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude,
          longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01
        }, 1000);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error updating shared location:', error);
      setAlertConfig({
        visible: true,
        title: isRTL ? 'خطأ' : 'Error',
        message: isRTL ? 'فشل في تحديث الموقع' : 'Failed to update location',
        type: 'error',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: isRTL ? 'حسنا' : 'OK'
      });
    }
  };

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (trackingInterval) {
        clearInterval(trackingInterval);
      }
    };
  }, [trackingInterval]);

  // Start location sharing with selected user
  const startLocationSharing = async () => {
    if (!selectedUser || !user?.id) return;
    
    try {
      setIsRefreshing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // Use existing location if available, otherwise get new location
      let location;
      if (userLocation) {
        location = {
          coords: {
            latitude: userLocation.latitude,
            longitude: userLocation.longitude
          }
        };
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setAlertConfig({
            visible: true,
            title: isRTL ? 'خطأ' : 'Error',
            message: isRTL ? 'يجب السماح بالوصول إلى الموقع لمشاركته' : 'Location permission is required to share location',
            type: 'error',
            onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
            confirmText: isRTL ? 'حسنا' : 'OK'
          });
          return;
        }
        
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
      }
      
      // Add sharing document
      const shareDoc = await addDoc(collection(db, 'location_sharing'), {
        sharer_id: user.id,
        recipient_id: selectedUser.id,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        last_updated: new Date().toISOString(),
        is_active: true
      });
      
      // Send location share notification
      await sendLocationShareNotification(
        selectedUser.id, 
        user?.fullName || (isRTL ? 'مستخدم' : 'A user'), 
        isRTL,
        user.id
      );
      
      // Close modal and show success
      setActiveModal('none');
      setSelectedUser(null);
      setSearchQuery('');
      setFilteredUsers(appUsers);
      
      // Show success message
      setAlertConfig({
        visible: true,
        title: isRTL ? 'تم بدء المشاركة' : 'Sharing Started',
        message: isRTL ? `أنت الآن تشارك موقعك مع ${selectedUser.name}` : `You are now sharing your location with ${selectedUser.name}`,
        type: 'success',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: isRTL ? 'حسنا' : 'OK'
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error starting location sharing:', error);
      setAlertConfig({
        visible: true,
        title: isRTL ? 'خطأ' : 'Error',
        message: isRTL ? 'فشل في بدء مشاركة الموقع' : 'Failed to start location sharing',
        type: 'error',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: isRTL ? 'حسنا' : 'OK'
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Memoize request markers
  const requestMarkers = useMemo(() => trackRequests.map((request) => (
    <Marker
      key={request.docId}
      coordinate={{
        latitude: request.latitude,
        longitude: request.longitude
      }}
      title={request.sharer.name}
      description={`Last updated: ${formatTimeElapsed(request.last_updated)}`}
      pinColor="green"
    />
  )), [trackRequests, now]);

  // Memoize render functions
  const renderUserItem = useCallback(({ item }: { item: AppUser }) => (
    <TouchableOpacity 
      className={`flex-row items-center p-3 border-b border-gray-100 ${selectedUser?.id === item.id ? 'bg-orange-50' : ''}`}
      onPress={() => {
        // Set the selected user with a small delay to prevent UI glitches
        setSelectedUser(item);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      activeOpacity={0.7}
    >
      <View className="w-10 h-10 rounded-full bg-gray-200 justify-center items-center mr-3">
        {item.profile_image ? (
          <Image 
            source={{ uri: item.profile_image }} 
            className="w-10 h-10 rounded-full" 
          />
        ) : (
          <Text className="text-gray-500 font-bold">
            {(item.name?.charAt(0) || item.email?.charAt(0) || '?').toUpperCase()}
          </Text>
        )}
      </View>
      <View className="flex-1">
        <Text className="font-bold text-gray-800">{item.name || item.email || 'User'}</Text>
        <Text className="text-gray-500 text-sm">{item.email}</Text>
      </View>
      {selectedUser?.id === item.id && (
        <MaterialIcons name="check-circle" size={24} color="#f97316" />
      )}
    </TouchableOpacity>
  ), [selectedUser]);

  // Render request item
  const renderRequestItem = ({ item }: { item: any }) => {
    return (
      <TouchableOpacity
        className="flex-row items-center p-4 border-b border-gray-100"
        onPress={() => {
          viewSharerLocation(item);
          setShowRequestsModal(false); // Close the modal when clicking View
        }}
      >
        <View className="w-12 h-12 rounded-full bg-gray-200 justify-center items-center mr-4">
          {item.sharer.profile_image ? (
            <Image source={{ uri: item.sharer.profile_image }} className="w-12 h-12 rounded-full" />
          ) : (
            <Text className="text-gray-500 font-bold text-lg">
              {(item.sharer.name?.charAt(0) || item.sharer.email?.charAt(0) || '?').toUpperCase()}
            </Text>
          )}
        </View>
        <View className="flex-1">
          <Text className="font-bold text-gray-800 text-lg">{item.sharer.name}</Text>
          <Text className="text-gray-500 text-sm">{item.sharer.email}</Text>
          <Text className="text-xs text-gray-400 mt-1">Last updated: {formatTimeElapsed(item.last_updated)}</Text>
        </View>
        <Text className="text-orange-500 font-bold">View</Text>
      </TouchableOpacity>
    );
  };

  // Render search user modal
  const renderSearchModal = () => {
    if (activeModal !== 'search') return null;
    
    return (
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View className={`${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} justify-between items-center mb-4`}>
            <Text className="text-xl font-CairoBold text-gray-800">
              {isRTL ? 'مشاركة الموقع مع' : 'Share Location With'}
            </Text>
            <TouchableOpacity 
              onPress={() => {
                setActiveModal('none');
                setSearchQuery('');
              }}
              className="p-1"
            >
              <AntDesign name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          
          <View className="flex-row items-center bg-gray-100 rounded-3xl px-4 py-2 mb-4">
            <AntDesign name="search1" size={20} color="#9ca3af" />
            <TextInput
              className="flex-1 ml-2 text-gray-800 text-base font-CairoRegular"
              placeholder={isRTL ? "بحث عن مستخدم..." : "Search user..."}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#9ca3af"

            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <AntDesign name="close" size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
          
          <FlatList
            data={filteredUsers}
            renderItem={({ item }) => (
              <TouchableOpacity 
                className={`flex-row items-center p-3 border-b border-gray-100 ${selectedUser?.id === item.id ? 'bg-orange-50' : ''}`}
                onPress={() => {
                  setSelectedUser(item);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.7}
              >
                <View className="w-10 h-10 rounded-full bg-gray-200 justify-center items-center mr-3">
                  {item.profile_image ? (
                    <Image 
                      source={{ uri: item.profile_image }} 
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <Text className="text-gray-500 font-CairoBold">
                      {(item.name?.charAt(0) || item.email?.charAt(0) || '?').toUpperCase()}
                    </Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-base font-CairoBold text-gray-800">{item.name || item.email || 'User'}</Text>
                  <Text className="text-sm font-CairoRegular text-gray-500">{item.email}</Text>
                </View>
                {selectedUser?.id === item.id && (
                  <MaterialIcons name="check-circle" size={24} color="#f97316" />
                )}
              </TouchableOpacity>
            )}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <View className="p-6 items-center">
                <Text className="text-gray-500 font-CairoRegular text-center">
                  {isRTL ? 'لم يتم العثور على مستخدمين' : 'No users found'}
                </Text>
              </View>
            }
            contentContainerStyle={{ flexGrow: 1 }}
          />

          <View className="flex-row mt-4">
            <TouchableOpacity 
              className="flex-1 bg-gray-100 py-3 rounded-xl mr-2 items-center justify-center"
              onPress={() => {
                setActiveModal('none');
                setSearchQuery('');
              }}
            >
              <Text className="text-gray-800 font-CairoMedium text-base">
                {isRTL ? 'إلغاء' : 'Cancel'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              className={`flex-1 py-3 rounded-xl items-center justify-center ${selectedUser ? 'bg-orange-500' : 'bg-gray-300'}`}
              onPress={() => {
                if (selectedUser) {
                  startLocationSharing();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
              }}
              disabled={!selectedUser || isRefreshing}
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className={`font-CairoMedium text-base ${selectedUser ? 'text-white' : 'text-gray-500'}`}>
                  {isRTL ? 'بدء المشاركة' : 'Start Sharing'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };
  const [showRequestsModal, setShowRequestsModal] = useState(false);

  // Function to update location for all shared users
  const updateAllSharedLocations = async () => {
    if (!user?.id || myShares.length === 0) return;
    
    try {
      setIsUpdatingAll(true);
      
      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      
      // Update location for each active share
      const updatePromises = myShares.map(share => 
        updateDoc(doc(db, 'location_sharing', share.docId), {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          last_updated: new Date().toISOString()
        })
      );
      
      await Promise.all(updatePromises);
      
      // Update user's own location state
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      });
      
      // Center map on new location
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01
        }, 1000);
      }
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAlertConfig({
        visible: true,
        title: isRTL ? 'تم التحديث' : 'Updated',
        message: isRTL ? 'تم تحديث موقعك لجميع المستخدمين' : 'Your location has been updated for all users',
        type: 'success',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: isRTL ? 'حسنا' : 'OK'
      });
    } catch (error) {
      console.error('Error updating all locations:', error);
      setAlertConfig({
        visible: true,
        title: isRTL ? 'خطأ' : 'Error',
        message: isRTL ? 'فشل في تحديث الموقع' : 'Failed to update location',
        type: 'error',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: isRTL ? 'حسنا' : 'OK'
      });
    } finally {
      setIsUpdatingAll(false);
    }
  };

  // Render my shares modal
  const renderMySharesModal = () => {
    if (activeModal !== 'shares') return null;
    
    return (
    <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View className={`${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} justify-between items-center mb-2`}>
            <Text className="text-xl font-CairoBold text-gray-800">
              {isRTL ? 'مشاركاتي' : 'My Shares'}
            </Text>
            <TouchableOpacity 
              onPress={() => setActiveModal('none')}
              className="p-1"
            >
              <AntDesign name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          <Text className={`text-sm text-gray-500 font-CairoRegular mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {isRTL ? 'الاشخاص الذين اشارك موقعي معهم' : 'People you are sharing your location with'}
          </Text>
          
          {myShares.length > 0 && (
            <TouchableOpacity
              className={`bg-orange-500 py-3 px-4 rounded-lg mx-4 mb-4 items-center justify-center min-h-[44px] ${isUpdatingAll ? 'opacity-70' : ''}`}
              onPress={updateAllSharedLocations}
              disabled={isUpdatingAll}
            >
              {isUpdatingAll ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-CairoBold text-base">
                  {isRTL ? 'تحديث الموقع للجميع' : 'Update Location for All'}
                </Text>
              )}
            </TouchableOpacity>
          )}
          
          <FlatList
            data={myShares}
            keyExtractor={item => item.docId}
            renderItem={({ item }) => (
              <View className="flex-row items-center p-3 border-b border-gray-100">
                <TouchableOpacity 
                  onPress={() => {
                    router.push(`/profile/${item.recipient.id}`);
                    setActiveModal('none');
                  }}
                  className="w-10 h-10 rounded-full bg-gray-200 justify-center items-center mr-2"
                >
                  {item.recipient.profile_image ? (
                    <Image 
                      source={{ uri: item.recipient.profile_image }} 
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <Text className="text-gray-500 font-CairoBold">
                      {(item.recipient.name?.charAt(0) || '?').toUpperCase()}
                    </Text>
                  )}
                </TouchableOpacity>
                <View className="flex-1">
                  <TouchableOpacity 
                    onPress={() => {
                      router.push(`/profile/${item.recipient.id}`);
                      setActiveModal('none');
                    }}
                    className="mb-1"
                  >
                    <Text className="text-base font-CairoBold text-gray-800">{item.recipient.name}</Text>
                  </TouchableOpacity>
                  <Text className="text-sm font-CairoRegular text-gray-500">{item.recipient.email}</Text>
                  <Text className="text-xs font-CairoRegular text-gray-400 mt-1">
                    {isRTL ? 'آخر تحديث: ' : 'Last updated: '}{formatTimeElapsed(item.last_updated)}
                  </Text>
                </View>
                <TouchableOpacity
                  className={`bg-red-500 py-2 px-4 rounded-lg min-w-[80px] min-h-[36px] justify-center items-center ${stoppingShares.has(item.docId) ? 'opacity-70' : ''}`}
                  onPress={() => {
                    stopSharing(item.docId);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                  disabled={stoppingShares.has(item.docId)}
                >
                  {stoppingShares.has(item.docId) ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className="text-white font-CairoBold text-sm">
                      {isRTL ? 'إيقاف' : 'Stop'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <View className="p-6 items-center">
                <Text className="text-gray-500 font-CairoRegular text-center">
                  {isRTL ? 'لا توجد مشاركات نشطة' : 'No active shares'}
                </Text>
              </View>
            }
            contentContainerStyle={{ flexGrow: 1 }}
          />
        </View>
      </View>
    );
  };


// Render requests modal
const renderRequestsModal = () => {
  if (!showRequestsModal) return null;
  
  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View className={`${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} justify-between items-center mb-4`}>
          <Text className="text-xl font-CairoBold text-gray-800">
            {isRTL ? 'طلبات الموقع' : 'Location Requests'}
          </Text>
          <TouchableOpacity 
            onPress={() => setShowRequestsModal(false)}
            className="p-1"
          >
            <AntDesign name="close" size={24} color="#374151" />
          </TouchableOpacity>
        </View>
        
        <Text className={`text-sm text-gray-500 font-CairoRegular mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
          {isRTL ? 'الاشخاص الذين يشاركون موقعهم معك في الوقت الحالي' : 'People who are currently sharing their location with you'}
        </Text>
        
        {loading ? (
          <View className="flex-1">
            {[1, 2, 3].map((_, index) => (
              <View key={index} className="flex-row items-center p-4 border-b border-gray-100">
                <View className="w-10 h-10 rounded-full bg-gray-200" />
                <View className="flex-1 ml-4">
                  <View className="h-4 bg-gray-200 rounded w-32 mb-2" />
                  <View className="h-3 bg-gray-200 rounded w-48 mb-2" />
                  <View className="h-3 bg-gray-200 rounded w-24" />
                </View>
                <View className="w-16 h-8 bg-gray-200 rounded-full" />
              </View>
            ))}
          </View>
        ) : trackRequests.length > 0 ? (
          <FlatList
            data={trackRequests}
            keyExtractor={item => item.docId}
            renderItem={renderRequestItem}
            contentContainerStyle={{ paddingBottom: 20 }}
            initialNumToRender={5}
            maxToRenderPerBatch={10}
            windowSize={5}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={fetchUserLocation}
                colors={['#f97316']}
                tintColor="#f97316"
                title={isRTL ? 'جاري التحديث...' : 'Refreshing...'}
                titleColor="#f97316"
                progressViewOffset={20}
              />
            }
          />
        ) : (
          <View className="flex-1 justify-center items-center p-4">
            <Text className="text-gray-500 font-CairoRegular text-center">
              {isRTL ? 'لا توجد طلبات موقع نشطة' : 'No active location requests'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

  if (isInitialLoading) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView className="flex-1 bg-white">
          {/* Header */}
          <View className="flex-row justify-between items-center p-4 border-b border-gray-200">
            <View className="w-6 h-6 rounded-full bg-gray-200" />
            <View className="w-32 h-6 bg-gray-200 rounded" />
            <View className="w-20 h-6 bg-gray-200 rounded" />
          </View>

          {/* Map Skeleton */}
          <View className="flex-1 bg-gray-100" />

          {/* Bottom Sheet with Skeleton */}
          <View className="bg-white rounded-t-3xl p-4">
            <View className="w-40 h-6 bg-gray-200 rounded mb-4" />
            <View className="space-y-4">
              {[1, 2, 3].map((_, index) => (
                <View key={index} className="flex-row items-center p-4 border-b border-gray-100">
                  <View className="w-10 h-10 rounded-full bg-gray-200" />
                  <View className="flex-1 ml-4">
                    <View className="h-4 bg-gray-200 rounded w-32 mb-2" />
                    <View className="h-3 bg-gray-200 rounded w-48 mb-2" />
                    <View className="h-3 bg-gray-200 rounded w-24" />
                  </View>
                  <View className="w-16 h-8 bg-gray-200 rounded-full" />
                </View>
              ))}
            </View>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView className="flex-1 bg-white">
        {/* Header */}
        <Header title={language === 'ar' ? 'تتبع الموقع' : 'Location Tracking' } showProfileImage={false} showSideMenu={false} />

        {/* Map View */}
        <View className="flex-1">
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            initialRegion={
              userLocation ? {
                latitude: userLocation.latitude,
                longitude: userLocation.longitude,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01
              } : undefined
            }
          >
            {userLocation && (
              <Marker
                coordinate={{
                  latitude: userLocation.latitude,
                  longitude: userLocation.longitude
                }}
                title="Your Location"
                pinColor="blue"
              />
            )}
            
            {selectedLocation && (
              <Marker
                coordinate={{
                  latitude: selectedLocation.latitude,
                  longitude: selectedLocation.longitude
                }}
                title={selectedLocation.title}
                pinColor="red"
              />
            )}
            
            {requestMarkers}
          </MapView>

          {/* Map Actions */}
          <View className="absolute top-4 right-4 space-y-2 z-10">
            <TouchableOpacity
              className="bg-white w-14 h-14 rounded-full items-center justify-center shadow-lg"
              onPress={fetchUserLocation}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <ActivityIndicator size="small" color="#f97316" />
              ) : (
                <MaterialIcons name="my-location" size={24} color="#f97316" />
              )}
            </TouchableOpacity>

            {/* My Shares Button */}
            <TouchableOpacity
              className="bg-gray-600 w-14 h-14 rounded-full items-center justify-center shadow-lg"
              onPress={() => setActiveModal('shares')}
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 4,
                zIndex: 10
              }}
            >
              <MaterialIcons name="share" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Floating Action Button for sharing location */}
          <TouchableOpacity
            className="absolute bottom-6 right-6 w-16 h-16 bg-orange-500 rounded-full items-center justify-center shadow-lg"
            onPress={() => {
              setSelectedUser(null);
              setSearchQuery('');
              setFilteredUsers(appUsers);
              setActiveModal('search');
            }}
            style={{
              shadowColor: '#f97316',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
              zIndex: 10
            }}
          >
            <MaterialIcons name="person-add" size={32} color="#fff" />
          </TouchableOpacity>
{/* Button to view Location Requests */}
<TouchableOpacity
          className="absolute bottom-6 left-6 w-16 h-16 bg-blue-500 rounded-full items-center justify-center shadow-lg"
          onPress={() => setShowRequestsModal(true)}
          style={{
            shadowColor: '#3b82f6',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
            zIndex: 10
          }}
        >
          <MaterialIcons name="list-alt" size={32} color="#fff" />
        </TouchableOpacity>

          {/* Location sharing status */}
          {isLocationSharing && (
            <View className="absolute bottom-32 left-4 right-4 bg-white p-3 rounded-lg shadow-md">
              <Text className="text-center font-bold text-green-600">
                Sharing location with {selectedUser?.name}
              </Text>
            </View>
          )}
        </View>

        {/* Bottom Sheet for Requests */}
         {renderRequestsModal()}

        {/* Render modals */}
        {renderSearchModal()}
        {renderMySharesModal()}

        {/* Custom Alert */}
        <CustomAlert
          visible={alertConfig.visible}
          title={alertConfig.title}
          message={alertConfig.message}
          type={alertConfig.type}
          onConfirm={alertConfig.onConfirm}
          onCancel={alertConfig.onCancel}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  androidShadow: {
    elevation: 5,
  },
  iosShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    backgroundColor: '#f97316',
    borderRadius: 32,
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      android: { elevation: 6 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      }
    }),
    zIndex: 20
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '90%',
    maxHeight: '80%',
    padding: 16,
    ...Platform.select({
      android: { elevation: 5 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      }
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937'
  },
  closeButton: {
    padding: 4
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 16
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: '#1f2937',
    fontSize: 16
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6'
  },
  selectedUserItem: {
    backgroundColor: '#fff7ed'
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20
  },
  avatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6b7280'
  },
  userInfo: {
    flex: 1
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937'
  },
  userEmail: {
    fontSize: 14,
    color: '#6b7280'
  },
  emptyListContainer: {
    padding: 24,
    alignItems: 'center'
  },
  emptyListText: {
    color: '#6b7280',
    fontSize: 16
  },
  usersList: {
    flexGrow: 1
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 16
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
    marginRight: 8
  },
  confirmButton: {
    backgroundColor: '#f97316'
  },
  disabledButton: {
    backgroundColor: '#e5e7eb'
  },
  cancelButtonText: {
    color: '#1f2937',
    fontWeight: '500',
    fontSize: 16
  },
  confirmButtonText: {
    color: 'white',
    fontWeight: '500',
    fontSize: 16
  },
  disabledButtonText: {
    color: '#9ca3af'
  },
  shareItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6'
  },
  lastUpdated: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4
  },
  stopButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 80,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center'
  },
  stopButtonDisabled: {
    backgroundColor: '#fca5a5'
  },
  stopButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14
  },
  sharesList: {
    flexGrow: 1
  },
  viewButtonContainer: {
    padding: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#f3f4f6'
  },
  viewButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#f97316'
  },
  bottomSheetContainer: {
    flex: 1,
    backgroundColor: 'white'
  },
  bottomSheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 16
  },
  bottomSheetContent: {
    paddingBottom: 20
  },
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6'
  },
  requestInfo: {
    flex: 1,
    marginLeft: 12
  },
  requestName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937'
  },
  requestEmail: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2
  },
  requestTime: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4
  },
  viewButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 16
  },
  updateAllButton: {
    backgroundColor: '#f97316',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44
  },
  updateAllButtonDisabled: {
    backgroundColor: '#fb923c'
  },
  updateAllButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16
  },
  alertRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContainer: {
    width: '85%',
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
  },
  alertHeader: {
    padding: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  alertMessage: {
    fontSize: 16,
    color: '#4b5563',
    textAlign: 'center',
    lineHeight: 22,
  },
  alertButtons: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  alertCancelButton: {
    flex: 1,
    paddingVertical: 16,
  },
  alertCancelButtonLTR: {
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  alertCancelButtonRTL: {
    borderLeftWidth: 1,
    borderLeftColor: '#e5e7eb',
  },
  alertConfirmButton: {
    paddingVertical: 16,
  },
  alertCancelButtonText: {
    fontSize: 16,
    color: '#4b5563',
    textAlign: 'center',
    fontWeight: '500',
  },
  alertConfirmButtonText: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    fontWeight: '500',
  },
}); 