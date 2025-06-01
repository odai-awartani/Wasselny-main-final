import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, FlatList, Alert, Image, TextInput, Animated, StyleSheet, Platform, RefreshControl, Modal } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, addDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MaterialIcons, AntDesign, Ionicons } from '@expo/vector-icons';
import { useLanguage } from '@/context/LanguageContext';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Header from '@/components/Header';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendLocationShareNotification, sendLocationUpdateNotification } from '@/lib/notifications';

interface Share {
  recipient_id: string;
  latitude: number;
  longitude: number;
  last_updated: string;
  is_active: boolean;
}

interface RecipientInfo {
  id: string;
  name: string;
  email: string;
  profile_image?: string;
}

interface AppUser {
  id: string;
  name: string;
  email: string;
  profile_image?: string;
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
    >
      <View className="flex-1 justify-center items-center bg-black/50">
        <Animated.View 
          className="w-[85%] bg-white rounded-2xl overflow-hidden"
          style={[
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
          
          <View className="flex-row border-t border-gray-200">
            {onCancel && (
              <TouchableOpacity
                onPress={onCancel}
                className="flex-1 py-4 border-r border-gray-200"
              >
                <Text className="text-base text-gray-600 text-center font-CairoMedium">
                  {cancelText}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onConfirm}
              className={`py-4 ${onCancel ? 'flex-1' : 'w-full'}`}
              style={{ backgroundColor: typeStyles.color }}
            >
              <Text className="text-base text-white text-center font-CairoMedium">
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

export default function MySharesPage() {
  const { user } = useUser();
  const { language } = useLanguage();
  const isRTL = language === 'ar';
  const [shares, setShares] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<'none' | 'search'>('none');
  const [searchQuery, setSearchQuery] = useState('');
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AppUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [modalAnimation] = useState(new Animated.Value(0));
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [stoppingShares, setStoppingShares] = useState<{[key: string]: boolean}>({});
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [scrollY] = useState(new Animated.Value(0));
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    onConfirm: () => {},
    confirmText: undefined as string | undefined,
    onCancel: undefined as (() => void) | undefined,
  });

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true }
  );

  useEffect(() => {
    if (!user?.id) return;
    setIsInitialLoading(true);
    const q = query(
      collection(db, 'location_sharing'),
      where('sharer_id', '==', user.id),
      where('is_active', '==', true)
    );
    const unsub = onSnapshot(q, async (snapshot) => {
      const s: any[] = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as Share;
        // Fetch recipient info
        const recDoc = await getDoc(doc(db, 'users', data.recipient_id));
        let recipient: RecipientInfo = {
          id: data.recipient_id,
          name: '',
          email: '',
        };
        if (recDoc.exists()) {
          const d = recDoc.data();
          recipient = {
            id: data.recipient_id,
            name: d.name || d.email || 'User',
            email: d.email,
            profile_image: d.profile_image_url,
          };
        }
        s.push({ ...data, recipient, docId: docSnap.id });
      }
      setShares(s);
      setIsInitialLoading(false);
    });
    return () => unsub();
  }, [user?.id]);

  // Load app users for sharing
  useEffect(() => {
    if (!user?.id) return;
    
    setIsSearchLoading(true);
    const q = query(collection(db, 'users'));
    const unsub = onSnapshot(q, (snapshot) => {
      const users: AppUser[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Don't include current user
        if (doc.id !== user.id) {
          users.push({
            id: doc.id,
            name: data.name || data.email || 'User',
            email: data.email,
            profile_image: data.profile_image_url
          });
        }
      });
      setAppUsers(users);
      setFilteredUsers(users);
      setIsSearchLoading(false);
    });
    
    return () => unsub();
  }, [user?.id]);

  // Filter users based on search query and existing shares
  useEffect(() => {
    if (!searchQuery.trim()) {
      // Filter out users who are already sharing their location
      const filtered = appUsers.filter(user => 
        !shares.some(share => share.recipient.id === user.id)
      );
      setFilteredUsers(filtered);
      return;
    }
    
    const filtered = appUsers.filter(user => 
      (user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())) &&
      !shares.some(share => share.recipient.id === user.id)
    );
    setFilteredUsers(filtered);
  }, [searchQuery, appUsers, shares]);

  // Animate modal
  useEffect(() => {
    if (activeModal === 'search') {
      Animated.parallel([
        Animated.spring(modalAnimation, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7
        }),
        Animated.timing(modalAnimation, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(modalAnimation, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true
        }),
        Animated.spring(modalAnimation, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 7
        })
      ]).start();
    }
  }, [activeModal]);

  const stopSharing = async (docId: string) => {
    try {
      setStoppingShares(prev => ({ ...prev, [docId]: true }));
      await updateDoc(doc(db, 'location_sharing', docId), { is_active: false });

      // Find the share object to get the recipient's name
      const stoppedShare = shares.find(share => share.docId === docId);
      const recipientName = stoppedShare?.recipient?.name || (isRTL ? 'المستخدم' : 'the user');

      // Use custom alert for stop sharing success message
      setAlertConfig({
        visible: true,
        title: isRTL ? 'تم الإيقاف' : 'Stopped',
        message: isRTL ? `تم إيقاف مشاركة الموقع مع ${recipientName}` : 'Location sharing stopped.',
        type: 'warning', // Use warning type for orange theme
        onConfirm: () => setAlertConfig({ ...alertConfig, visible: false }), // Close alert on confirm
        confirmText: isRTL ? 'حسنا' : 'OK',
        onCancel: undefined, // No cancel button
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', 'Could not stop sharing.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setStoppingShares(prev => ({ ...prev, [docId]: false }));
    }
  };

  const startLocationSharing = async () => {
    if (!selectedUser) return;
    
    try {
      setIsRefreshing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      // Get current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Location permission denied');
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      
      // Add sharing document
      const shareDoc = await addDoc(collection(db, 'location_sharing'), {
        sharer_id: user?.id,
        recipient_id: selectedUser.id,
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        last_updated: new Date().toISOString(),
        is_active: true
      });
      
      // Send location share notification using the centralized function
      await sendLocationShareNotification(
        selectedUser.id, 
        user?.fullName || (isRTL ? 'مستخدم' : 'A user'), 
        isRTL,
        user?.id || ''
      );
      
      // Close modal and show success
      setActiveModal('none');
      setSelectedUser(null);
      setSearchQuery('');
      setFilteredUsers(appUsers);
      
      // Use custom alert for success message
      setAlertConfig({
        visible: true,
        title: isRTL ? 'تم بدء المشاركة' : 'Sharing Started',
        message: isRTL ? `أنت الآن تشارك موقعك مع ${selectedUser.name}` : `You are now sharing your location with ${selectedUser.name}`,
        type: 'warning', // Use the warning type for orange theme
        onConfirm: () => setAlertConfig({ ...alertConfig, visible: false }), // Close alert on confirm
        confirmText: isRTL ? 'حسنا' : 'OK',
        onCancel: undefined, // No cancel button
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error starting location sharing:', error);
      Alert.alert('Error', 'Failed to start location sharing');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const updateLocation = async (share: any) => {
    try {
      setIsRefreshing(true);
      
      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      
      // Update location in Firestore
      await updateDoc(doc(db, 'location_sharing', share.docId), {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        last_updated: new Date().toISOString()
      });
      
      // Send location update notification
      await sendLocationUpdateNotification(
        share.recipient.id,
        user?.fullName || (isRTL ? 'مستخدم' : 'A user'),
        isRTL,
        user?.id || ''
      );
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error updating location:', error);
      Alert.alert('Error', 'Failed to update location');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const refreshShares = async () => {
    if (!user?.id || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const q = query(
        collection(db, 'location_sharing'),
        where('sharer_id', '==', user.id),
        where('is_active', '==', true)
      );
      const snapshot = await getDocs(q);
      const s: any[] = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data() as Share;
        const recDoc = await getDoc(doc(db, 'users', data.recipient_id));
        let recipient: RecipientInfo = {
          id: data.recipient_id,
          name: '',
          email: '',
        };
        if (recDoc.exists()) {
          const d = recDoc.data();
          recipient = {
            id: data.recipient_id,
            name: d.name || d.email || 'User',
            email: d.email,
            profile_image: d.profile_image_url,
          };
        }
        s.push({ ...data, recipient, docId: docSnap.id });
      }
      setShares(s);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Error refreshing shares:', error);
      Alert.alert('Error', 'Failed to refresh shares');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Function to update location for all shared users
  const updateAllSharedLocations = async () => {
    if (!user?.id || shares.length === 0) return;
    
    try {
      setIsUpdatingAll(true);
      
      // Get current location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Location permission denied');
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      
      // Update location for each active share
      const updatePromises = shares.map(share => 
        updateDoc(doc(db, 'location_sharing', share.docId), {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          last_updated: new Date().toISOString()
        })
      );
      
      await Promise.all(updatePromises);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Use custom alert for update success message
      setAlertConfig({
        visible: true,
        title: isRTL ? 'تم التحديث' : 'Updated',
        message: isRTL ? 'تم تحديث موقعك لجميع المستخدمين' : 'Your location has been updated for all users',
        type: 'warning', // Use warning type for orange theme
        onConfirm: () => setAlertConfig({ ...alertConfig, visible: false }), // Close alert on confirm
        confirmText: isRTL ? 'حسنا' : 'OK',
        onCancel: undefined, // No cancel button
      });
    } catch (error) {
      console.error('Error updating all locations:', error);
      Alert.alert(
        isRTL ? 'خطأ' : 'Error',
        isRTL ? 'فشل في تحديث الموقع' : 'Failed to update location'
      );
    } finally {
      setIsUpdatingAll(false);
    }
  };

  // Skeleton loading component
  const renderSkeletonItem = () => (
    <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
      <View className="flex-row items-center">
        <View className="w-14 h-14 rounded-full bg-gray-200" style={styles.skeletonAnimation} />
        <View className="flex-1 ml-4">
          <View className="h-5 bg-gray-200 rounded-md w-32 mb-2" style={styles.skeletonAnimation} />
          <View className="h-4 bg-gray-200 rounded-md w-48 mb-2" style={styles.skeletonAnimation} />
          <View className="h-3 bg-gray-200 rounded-md w-24" style={styles.skeletonAnimation} />
        </View>
        <View className="w-20 h-10 bg-gray-200 rounded-xl" style={styles.skeletonAnimation} />
      </View>
    </View>
  );

  if (isInitialLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <CustomAlert 
          visible={alertConfig.visible}
          title={alertConfig.title}
          message={alertConfig.message}
          type={alertConfig.type}
          onConfirm={alertConfig.onConfirm}
          confirmText={alertConfig.confirmText}
          onCancel={alertConfig.onCancel}
        />
        <Header title={language === 'ar' ? 'مشاركاتي' : 'My Shares'} showSideMenu={false} showProfileImage={false} />
        <View className="flex-row justify-between items-center">
          <View className="flex-1 items-center">
            <Text className="text-gray-500 text-center mt-1 font-CairoRegular text-sm">
              {isRTL 
                ? 'شارك موقعك مع أصدقائك وعائلتك لضمان سلامتك' 
                : 'Share your location with friends and family for your safety'}
            </Text>
          </View>
        </View>
        <FlatList
          data={[1, 2, 3]}
          renderItem={renderSkeletonItem}
          keyExtractor={(_, index) => index.toString()}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onConfirm={alertConfig.onConfirm}
        confirmText={alertConfig.confirmText}
        onCancel={alertConfig.onCancel}
      />
      <Header title={language === 'ar' ? 'مشاركاتي' : 'My Shares'} showSideMenu={false} showProfileImage={false} />
      <View className="flex-row justify-between items-center">
        <View className="flex-1 items-center">
          <Text className="text-gray-500 text-center mt-1 font-CairoRegular text-sm">
            {isRTL 
              ? 'شارك موقعك مع أصدقائك وعائلتك لضمان سلامتك' 
              : 'Share your location with friends and family for your safety'}
          </Text>
        </View>
      </View>

      {shares.length > 0 && (
        <TouchableOpacity
          className="mx-4 my-2 bg-orange-500 rounded-xl p-3 items-center justify-center"
          onPress={updateAllSharedLocations}
          disabled={isUpdatingAll}
          style={[
            isUpdatingAll && { backgroundColor: '#fb923c' },
            {
              shadowColor: '#f97316',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.2,
              shadowRadius: 4,
              elevation: 3
            }
          ]}
        >
          {isUpdatingAll ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-white font-bold font-CairoBold text-base">
              {isRTL ? 'تحديث الموقع للجميع' : 'Update Location for All'}
            </Text>
          )}
        </TouchableOpacity>
      )}

      <Animated.FlatList
        data={shares}
        keyExtractor={item => item.recipient.id}
        contentContainerStyle={{ padding: 16 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshShares}
            colors={['#f97316']}
            tintColor="#f97316"
            title={isRTL ? 'جاري التحديث...' : 'Refreshing...'}
            titleColor="#f97316"
            progressViewOffset={20}
          />
        }
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => {
          scrollY.addListener(({ value }) => {
            if (value <= 0) {
              refreshShares();
            }
          });
        }}
        onScrollEndDrag={() => {
          scrollY.removeAllListeners();
        }}
        renderItem={({ item }) => (
          <View className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
            <View className="flex-row items-center">
              {/* Profile Image or Initial */}
              <View className="w-14 h-14 rounded-full bg-gray-200 justify-center items-center mr-4 overflow-hidden">
                {item.recipient.profile_image ? (
                  <Image 
                    source={{ uri: item.recipient.profile_image }}
                    className="w-14 h-14 rounded-full"
                    resizeMode="cover"
                  />
                ) : (
                  <Text className="text-gray-500 font-bold text-xl">
                    {(item.recipient.name?.charAt(0) || '?').toUpperCase()}
                  </Text>
                )}
              </View>

              {/* User Info */}
              <View className="flex-1">
                  <Text className="font-bold text-gray-800 text-base font-CairoBold">
                    {item.recipient.name || item.recipient.email}
                  </Text>
                  <Text className="text-gray-500 text-sm font-CairoRegular">
                    {item.recipient.email}
                  </Text>
                  <View className="flex-row items-center mt-1">
                    <MaterialIcons name="access-time" size={14} color="#9ca3af" />
                    <Text className="text-xs text-gray-400 ml-1 font-CairoRegular">
                      {isRTL ? 'آخر تحديث: ' : 'Last updated: '}
                      {new Date(item.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
              </View>

              {/* Stop Button */}
              <TouchableOpacity
                  className="bg-red-50 px-4 py-2 rounded-xl min-h-[40px] min-w-[80px] items-center justify-center"
                  onPress={() => {
                    stopSharing(item.docId);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                  disabled={stoppingShares[item.docId]}
                >
                  {stoppingShares[item.docId] ? (
                    <ActivityIndicator size="small" color="#ef4444" />
                  ) : (
                    <Text className="text-red-500 font-bold font-CairoBold">
                      {isRTL ? 'إيقاف' : 'Stop'}
                    </Text>
                  )}
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View className="flex-1 justify-center items-center py-16">
            <View className="w-20 h-20 rounded-full bg-orange-100 items-center justify-center mb-4">
              <MaterialIcons name="location-off" size={32} color="#f97316" />
            </View>
            <Text className="text-gray-400 text-center text-lg font-CairoBold mb-2">
              {isRTL ? 'لا توجد مشاركات نشطة' : 'No Active Shares'}
            </Text>
            <Text className="text-gray-400 text-center font-CairoRegular">
              {isRTL ? 'أنت لا تشارك موقعك مع أي شخص' : 'You are not sharing your location with anyone'}
            </Text>
          </View>
        }
      />

      {/* Floating Action Button */}
      <TouchableOpacity
        className="absolute bottom-6 right-6 w-16 h-16 bg-orange-500 rounded-full items-center justify-center shadow-lg"
        onPress={() => {
          setActiveModal('search');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }}
        style={{
          shadowColor: '#f97316',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8
        }}
      >
        <MaterialIcons name="person-add" size={32} color="#fff" />
      </TouchableOpacity>

      {/* Search Modal */}
      {activeModal === 'search' && (
        <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isRTL ? 'مشاركة الموقع مع' : 'Share Location With'}
            </Text>
            <TouchableOpacity 
              onPress={() => {
                setActiveModal('none');
                setSearchQuery('');
                setSelectedUser(null);
              }}
              style={styles.closeButton}
            >
              <AntDesign name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.searchContainer}>
            <AntDesign name="search1" size={20} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              placeholder={isRTL ? "بحث عن مستخدم..." : "Search user..."}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#9ca3af"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity 
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}
              >
                <AntDesign name="close" size={16} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
          
          {isSearchLoading ? (
            <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
              <Text style={styles.loadingText}>
                {isRTL ? 'جاري تحميل المستخدمين...' : 'Loading users...'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredUsers}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[
                    styles.userItem,
                    selectedUser?.id === item.id ? styles.selectedUserItem : null
                  ]}
                  onPress={() => {
                    setSelectedUser(item);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  activeOpacity={0.7}
                >
                   <View className="w-14 h-14 rounded-full bg-gray-100 justify-center items-center mr-4 overflow-hidden">
                    {item.profile_image ? (
                        <Image 
                          source={{ uri: item.profile_image }}
                          className="w-14 h-14 rounded-full"
                          resizeMode="cover"
                        />
                      ) : (
                       <Text className="text-gray-500 font-bold text-xl">
                          {(item.name?.charAt(0) || item.email?.charAt(0) || '?').toUpperCase()}
                        </Text>
                      )}
                    </View>
                   <View className="flex-1">
                       <Text className="font-bold text-gray-800 text-base font-CairoBold">
                          {item.name || 'User'}
                        </Text>
                       <Text className="text-gray-500 text-sm font-CairoRegular">
                          {item.email}
                       </Text>
                    </View>
                    {selectedUser?.id === item.id && (
                     <MaterialIcons name="check-circle" size={24} color="#f97316" />
                   )}
                 </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <View style={styles.emptyListContainer}>
                  <Text style={styles.emptyListText}>
                    {isRTL ? 'لم يتم العثور على مستخدمين' : 'No users found'}
                  </Text>
                </View>
              }
              contentContainerStyle={styles.usersList}
            />
          )}

          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[
                styles.actionButton,
                styles.cancelButton
              ]}
              onPress={() => {
                setActiveModal('none');
                setSearchQuery('');
                setSelectedUser(null);
              }}
            >
              <Text style={styles.cancelButtonText}>
                {isRTL ? 'إلغاء' : 'Cancel'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.actionButton,
                selectedUser ? styles.confirmButton : styles.disabledButton
              ]}
              onPress={() => {
                if (selectedUser) {
                  startLocationSharing();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
              }}
              disabled={!selectedUser || isRefreshing}
            >
              {isRefreshing ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={[
                  styles.confirmButtonText,
                  !selectedUser && styles.disabledButtonText
                ]}>
                  {isRTL ? 'بدء المشاركة' : 'Start Sharing'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    color: '#1f2937',
    fontFamily: 'CairoBold'
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
    fontSize: 16,
    fontFamily: 'CairoRegular'
  },
  clearButton: {
    padding: 4
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
    flex: 1,
    marginRight: 8
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    fontFamily: 'CairoBold',
    marginBottom: 2
  },
  userEmail: {
    fontSize: 14,
    color: '#6b7280',
    fontFamily: 'CairoRegular'
  },
  emptyListContainer: {
    padding: 24,
    alignItems: 'center'
  },
  emptyListText: {
    color: '#6b7280',
    fontSize: 16,
    fontFamily: 'CairoRegular'
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
    justifyContent: 'center',
    minHeight: 48
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
    fontSize: 16,
    fontFamily: 'CairoBold'
  },
  confirmButtonText: {
    color: 'white',
    fontWeight: '500',
    fontSize: 16,
    fontFamily: 'CairoBold'
  },
  disabledButtonText: {
    color: '#9ca3af'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  loadingText: {
    marginTop: 12,
    color: '#6b7280',
    fontSize: 16,
    fontFamily: 'CairoRegular'
  },
  skeletonAnimation: {
    opacity: 0.7,
    transform: [{ scale: 1 }],
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
}); 