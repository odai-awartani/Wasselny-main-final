import React, { useEffect, useState, useCallback, useRef } from "react";
import Map from "@/components/Map";
import RideCard from "@/components/RideCard";
import SuggestedRides, { SuggestedRidesRef } from "@/components/SuggestedRides";
import SuggestedRidesGrid from "@/components/SuggestedRidesGrid";
import FeatureCards from "@/components/FeatureCards";
import { icons, images } from '@/constants';
import { useNotifications } from '@/context/NotificationContext';
import { useLocationStore } from "@/store";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Image, RefreshControl, TouchableOpacity, Alert, Platform, StyleSheet, Modal, Animated } from "react-native";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useDriverStore } from '@/store';
import { Ride } from "@/types/type";
import { doc, getDoc, collection, query, where, getDocs, orderBy, updateDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, View } from "react-native";
import { FlatList } from "react-native";  
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from 'expo-haptics';
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from '@expo/vector-icons';
import { useLanguage } from "@/context/LanguageContext";
import GoogleTextInput from "@/components/GoogleTextInput";
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import Header from "@/components/Header";

type RootStackParamList = {
  tabs: {
    screen: string;
    params?: {
      searchQuery?: string;
      origin?: string;
    };
  };
};

type NavigationProp = DrawerNavigationProp<RootStackParamList>;

interface Location {
  latitude: number;
  longitude: number;
  address: string;
}

interface SavedLocation {
  createdAt: string;
  isDefault: boolean;
  latitude: number;
  longitude: number;
  name: string;
  userId: string;
}

function CustomMenuIcon({ isRTL }: { isRTL: boolean }) {
  return (
    <View style={{ width: 24, height: 24, justifyContent: 'center' }}>
      <View style={{ 
        width: 24, 
        height: 2.5, 
        backgroundColor: '#f97316', 
        borderRadius: 2, 
        marginBottom: 5,
        alignSelf: isRTL ? 'flex-end' : 'flex-start'
      }} />
      <View style={{ 
        width: 16, 
        height: 2.5, 
        backgroundColor: '#f97316', 
        borderRadius: 2, 
        marginBottom: 5,
        alignSelf: isRTL ? 'flex-end' : 'flex-start'
      }} />
      <View style={{ 
        width: 20, 
        height: 2.5, 
        backgroundColor: '#f97316', 
        borderRadius: 2,
        alignSelf: isRTL ? 'flex-end' : 'flex-start'
      }} />
    </View>
  );
}

const LocationList = React.memo(({ 
  locations, 
  onSelect, 
  selectedLocation, 
  language
}: { 
  locations: SavedLocation[], 
  onSelect: (location: SavedLocation) => void,
  selectedLocation: SavedLocation | null,
  language: string
}) => {
  const formatDate = useCallback((timestamp: any) => {
    try {
      let date: Date;
      if (timestamp?.seconds) {
        // Handle Firestore timestamp
        date = new Date(timestamp.seconds * 1000);
      } else if (timestamp instanceof Date) {
        // Handle Date object
        date = timestamp;
      } else if (typeof timestamp === 'string') {
        // Handle string date
        date = new Date(timestamp);
      } else {
        console.error('Invalid timestamp format:', timestamp);
        return '';
      }

      if (isNaN(date.getTime())) {
        console.error('Invalid date:', date);
        return '';
      }

      return date.toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  }, [language]);

  const renderItem = useCallback(({ item }: { item: SavedLocation }) => (
    <TouchableOpacity
      onPress={() => onSelect(item)}
      className={`p-3 rounded-lg mb-2 transition-all duration-200 ${
        selectedLocation?.createdAt === item.createdAt 
          ? 'bg-orange-50 border-2 border-orange-500' 
          : 'bg-gray-50 border-2 border-transparent'
      }`}
      activeOpacity={0.6}
    >
      <View className={`flex-row justify-between items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
        <View className="flex-1">
          <Text className={`text-gray-900 text-sm font-CairoBold ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {item.name}
          </Text>
          <Text className={`text-gray-500 text-xs ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
        <View className={`flex-row items-center ${language === 'ar' ? 'ml-2' : 'mr-2'}`}>
          {item.isDefault && (
            <View className="bg-orange-500 px-2 py-0.5 rounded-full mr-1">
              <Text className="text-white text-xs mt-1 font-CairoBold">
                {language === 'ar' ? 'افتراضي' : 'Default'}
              </Text>
            </View>
          )}
          {selectedLocation?.createdAt === item.createdAt && (
            <MaterialIcons name="check-circle" size={20} color="#f97316" />
          )}
        </View>
      </View>
    </TouchableOpacity>
  ), [selectedLocation, language, onSelect, formatDate]);

  return (
    <FlatList
      data={locations}
      keyExtractor={(item) => item.createdAt}
      renderItem={renderItem}
      showsVerticalScrollIndicator={true}
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      windowSize={5}
    />
  );
});

export default function Home() {
  const { setIsMenuVisible } = require('@/context/MenuContext').useMenu();
  const { t, language, setLanguage, isRTL } = useLanguage();
  const { setUserLocation, setDestinationLocation } = useLocationStore();
  const { unreadCount } = useNotifications();
  const { user } = useUser();
  const [hasPermission, setHasPermission] = useState<boolean>(false);
  const { signOut } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [isDriver, setIsDriver] = useState<boolean>(false);
  const [isCheckingDriver, setIsCheckingDriver] = useState<boolean>(true);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const navigation = useNavigation<NavigationProp>();
  const [refreshKey, setRefreshKey] = useState(0);
  const [inProgressRides, setInProgressRides] = useState<Ride[]>([]);
  const suggestedRidesRef = useRef<SuggestedRidesRef>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMapLoading, setIsMapLoading] = useState(true);
  const [headerRefreshKey, setHeaderRefreshKey] = useState(0);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<SavedLocation | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const checkIfUserIsDriver = async () => {
    if (!user?.id) {
      console.log('No user ID found');
      setIsCheckingDriver(false);
      return;
    }
    
    try {
      console.log('Checking driver status for user:', user.id);
      const userRef = doc(db, 'users', user.id);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        console.log('User data:', userData);
        const isUserDriver = userData.driver && userData.driver.is_active === true;
        console.log('Is user a driver?', isUserDriver);
        setIsDriver(isUserDriver);
        
        const imageUrl = userData.profile_image_url || userData.driver?.profile_image_url || null;
        setProfileImageUrl(imageUrl);
        setHeaderRefreshKey(prev => prev + 1);
      } else {
        console.log('User document does not exist');
        setIsDriver(false);
      }
    } catch (error) {
      console.error('Error checking driver status:', error);
      setIsDriver(false);
    } finally {
      setIsCheckingDriver(false);
    }
  };
       
  useEffect(() => {
    console.log('User changed:', user?.id);
    if (user?.id) {
      checkIfUserIsDriver();
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      console.log('Screen focused, checking driver status');
      if (user?.id) {
        checkIfUserIsDriver();
        setRefreshKey(prev => prev + 1);
      }
    }, [user?.id])
  );

  const handleDestinationPress = (location: Location) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      
      AsyncStorage.setItem('lastSearchQuery', location.address);
      
      navigation.navigate('tabs', { 
        screen: 'search',
        params: { 
          searchQuery: location.address,
          origin: JSON.stringify({
            latitude: location.latitude,
            longitude: location.longitude,
            address: location.address
          })
        }
      });
    } catch (error) {
      console.error('Error handling destination press:', error);
      Alert.alert(
        t.error,
        language === 'ar' ? 'حدث خطأ أثناء البحث' : 'An error occurred while searching'
      );
    }
  };

  const handleSearchTextChange = (text: string) => {
    if (text.length > 0) {
      AsyncStorage.setItem('currentSearchText', text);
    }
  };

  useEffect(() => {
    const requestLocation = async () => {
      try {
        setIsMapLoading(true);
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setHasPermission(false);
          Alert.alert(
            "Location Permission Denied",
            "Location permission is required to use this feature. Please enable it in your device settings."
          );
          return;
        }

        const cachedLocation = await AsyncStorage.getItem('userLocation');
        if (cachedLocation) {
          const parsedLocation = JSON.parse(cachedLocation);
          setUserLocation(parsedLocation);
        }

        let location = await Location.getCurrentPositionAsync({
          accuracy: Platform.OS === 'android' ? Location.Accuracy.Balanced : Location.Accuracy.High,
        });

        const newLocation = {
          latitude: location.coords?.latitude,
          longitude: location.coords?.longitude,
          address: t.currentLocation,
        };
        
        setUserLocation(newLocation);
        await AsyncStorage.setItem('userLocation', JSON.stringify(newLocation));
        setRefreshKey(prev => prev + 1);
      } catch (err) {
        console.error("Location request failed:", err);
        setHasPermission(false);
        let message = "Location request failed. Please ensure location services are enabled and permissions are granted in your device settings.";
        if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string' && (err as any).message.includes('unsatisfied device settings')) {
          message = "Location request failed due to unsatisfied device settings. Please enable location services (GPS) and try again.";
        }
        Alert.alert(
          "Location Error",
          message
        );
      } finally {
        setIsMapLoading(false);
      }
    };
    requestLocation();
  }, [t]);

  const fetchInProgressRides = async () => {
    if (!user?.id || !isDriver) return;
    
    try {
      const ridesRef = collection(db, 'rides');
      const q = query(
        ridesRef,
        where('driver_id', '==', user.id),
        where('status', '==', 'in-progress'),
        orderBy('created_at', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const rides: Ride[] = [];
      
      snapshot.forEach((doc) => {
        rides.push({ id: doc.id, ...doc.data() } as Ride);
      });
      
      setInProgressRides(rides);
    } catch (error) {
      console.error('Error fetching in-progress rides:', error);
    }
  };

  useEffect(() => {
    if (isDriver && user?.id) {
      fetchInProgressRides();
    }
  }, [isDriver, user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (isDriver && user?.id) {
        fetchInProgressRides();
      }
    }, [isDriver, user?.id])
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setIsMapLoading(true);
    try {
      // Update location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Platform.OS === 'android' ? Location.Accuracy.Balanced : Location.Accuracy.High,
      });
      
      const newLocation = {
        latitude: location.coords?.latitude,
        longitude: location.coords?.longitude,
        address: t.currentLocation,
      };
      
      setUserLocation(newLocation);
      await AsyncStorage.setItem('userLocation', JSON.stringify(newLocation));

      // Refresh driver status
      if (user?.id) {
        await checkIfUserIsDriver();
      }

      // Refresh in-progress rides if user is a driver
      if (isDriver && user?.id) {
        await fetchInProgressRides();
      }

      // Refresh suggested rides
      if (suggestedRidesRef.current) {
        await suggestedRidesRef.current.refresh();
      }

      // Trigger a re-render of the map
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error("Refresh failed:", err);
      Alert.alert(
        t.error,
        language === 'ar' ? 'حدث خطأ أثناء تحديث البيانات' : 'An error occurred while refreshing data'
      );
    } finally {
      setIsRefreshing(false);
      setIsMapLoading(false);
    }
  }, [user?.id, isDriver, t, language]);

  // Check if user has location set and if 12 hours have passed
  useEffect(() => {
    const checkUserLocationAndTime = async () => {
      try {
        const lastShownTime = await AsyncStorage.getItem('lastLocationModalShown');
        const currentTime = new Date().getTime();
        
        // If no last shown time exists, show modal and set time
        if (!lastShownTime) {
          console.log('First time showing location modal');
          setShowLocationModal(true);
          await AsyncStorage.setItem('lastLocationModalShown', currentTime.toString());
          return;
        }

        // Calculate time difference in hours
        const timeDiff = (currentTime - parseInt(lastShownTime)) / (1000 * 60 * 60);
        console.log(`Time since last show: ${timeDiff.toFixed(2)} hours`);
        
        // Only show if exactly 12 or more hours have passed
        if (timeDiff >= 12) {
          console.log('12 hours passed, showing location modal');
          setShowLocationModal(true);
          await AsyncStorage.setItem('lastLocationModalShown', currentTime.toString());
        } else {
          console.log(`Not showing modal - ${timeDiff.toFixed(2)} hours passed, need 12 hours`);
          setShowLocationModal(false);
        }
      } catch (error) {
        console.error('Error checking time interval:', error);
        setShowLocationModal(false);
      }
    };

    checkUserLocationAndTime();
  }, []);

  // Update last shown time when modal is closed
  const handleCloseModal = useCallback(async () => {
    setSelectedLocation(null);
    setShowLocationModal(false);
    try {
      const currentTime = new Date().getTime();
      await AsyncStorage.setItem('lastLocationModalShown', currentTime.toString());
      console.log('Updated last shown time:', new Date(currentTime).toLocaleString());
    } catch (error) {
      console.error('Error updating last shown time:', error);
    }
  }, []);

  // Add a debug effect to monitor modal state
  useEffect(() => {
    console.log('Modal visibility changed:', showLocationModal);
  }, [showLocationModal]);

  // Load saved locations
  useEffect(() => {
    const loadSavedLocations = async () => {
      try {
        setIsLoadingLocations(true);
        if (!user?.id) {
          console.log('No user ID found');
          return;
        }

        // Fetch locations from Firebase
        const locationsRef = collection(db, 'user_locations');
        const q = query(
          locationsRef,
          where('userId', '==', user.id),
          orderBy('createdAt', 'desc')
        );
        
        const snapshot = await getDocs(q);
        const locations: SavedLocation[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          locations.push({
            createdAt: data.createdAt,
            isDefault: data.isDefault,
            latitude: data.latitude,
            longitude: data.longitude,
            name: data.name,
            userId: data.userId
          });
        });

        console.log('Fetched locations:', locations);
        setSavedLocations(locations);
      } catch (error) {
        console.error('Error loading saved locations:', error);
        setSavedLocations([]);
      } finally {
        setIsLoadingLocations(false);
      }
    };

    loadSavedLocations();
  }, [user?.id]);

  const handleConfirmLocation = useCallback(async () => {
    if (!selectedLocation) return;
    
    try {
      setIsConfirming(true);
      const selectedLocationData = {
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        address: selectedLocation.name,
      };

      // Update the location in Firebase
      const userLocationRef = doc(db, 'users', user?.id || '');
      await updateDoc(userLocationRef, {
        location: selectedLocationData,
        updatedAt: new Date().toISOString()
      });

      // Update local state
      setUserLocation(selectedLocationData);
      await AsyncStorage.setItem('userLocation', JSON.stringify(selectedLocationData));
      
      // Update the default status in user_locations
      const locationsRef = collection(db, 'user_locations');
      const q = query(
        locationsRef,
        where('userId', '==', user?.id)
      );
      
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      
      snapshot.forEach((doc) => {
        batch.update(doc.ref, { isDefault: false });
      });
      
      // Set the selected location as default
      const selectedLocationRef = query(
        locationsRef,
        where('userId', '==', user?.id),
        where('latitude', '==', selectedLocation.latitude),
        where('longitude', '==', selectedLocation.longitude)
      );
      
      const selectedSnapshot = await getDocs(selectedLocationRef);
      selectedSnapshot.forEach((doc) => {
        batch.update(doc.ref, { isDefault: true });
      });

      await batch.commit();

      setShowLocationModal(false);
    } catch (error) {
      console.error('Error setting selected location:', error);
      setLocationError(
        language === 'ar'
          ? 'حدث خطأ أثناء تحديد الموقع'
          : 'An error occurred while setting the location'
      );
    } finally {
      setIsConfirming(false);
      setSelectedLocation(null);
    }
  }, [selectedLocation, user?.id, language]);

  const handleAddNewLocation = useCallback(() => {
    setShowLocationModal(false);
    router.push({
      pathname: '/(root)/location',
      params: { returnTo: 'home' }
    });
  }, []);

  const LocationModal = () => {
    const handleLocationSelect = useCallback((location: SavedLocation) => {
      if (selectedLocation?.createdAt === location.createdAt) {
        setSelectedLocation(null);
      } else {
        setSelectedLocation(location);
      }
    }, [selectedLocation]);

    return (
      <Modal
        visible={showLocationModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white p-4 rounded-xl w-[85%] max-h-[85%]">
            <View className={`flex-row justify-between items-center mb-3 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-gray-900`}>
                {language === 'ar' ? 'شو موقعك اليوم؟' : 'What is Your Location Today?'}
              </Text>
              <TouchableOpacity
                onPress={handleCloseModal}
                className="p-1"
              >
                <MaterialIcons name="close" size={22} color="#666" />
              </TouchableOpacity>
            </View>
            
            {locationError && (
              <Text className={`text-xs text-red-500 mb-3 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                {locationError}
              </Text>
            )}

            {isLoadingLocations ? (
              <View className="items-center justify-center py-4">
                <ActivityIndicator size="small" color="#f97316" />
              </View>
            ) : savedLocations.length > 0 ? (
              <>
                <View className="space-y-2 max-h-[400px]">
                  <LocationList
                    locations={savedLocations}
                    onSelect={handleLocationSelect}
                    selectedLocation={selectedLocation}
                    language={language}
                  />

                  <TouchableOpacity
                    onPress={handleConfirmLocation}
                    disabled={!selectedLocation || isConfirming}
                    className={`p-3 rounded-lg mt-2 ${
                      !selectedLocation 
                        ? 'bg-gray-300' 
                        : isConfirming 
                          ? 'bg-orange-400' 
                          : 'bg-orange-500'
                    }`}
                  >
                    {isConfirming ? (
                      <View className="flex-row items-center justify-center">
                        <ActivityIndicator size="small" color="#fff" />
                        <Text className={`text-center text-white text-sm ml-2 ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                          {language === 'ar' ? 'جاري التأكيد...' : 'Confirming...'}
                        </Text>
                      </View>
                    ) : (
                      <Text className={`text-center text-white text-sm ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                        {language === 'ar' ? 'تأكيد الموقع' : 'Confirm Location'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleAddNewLocation}
                    className="bg-gray-100 p-3 rounded-lg mt-2"
                  >
                    <Text className={`text-center text-gray-900 text-sm ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                      {language === 'ar' ? 'إضافة موقع جديد' : 'Add New Location'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View className="items-center justify-center py-4">
                <MaterialIcons name="location-off" size={40} color="#f97316" className="mb-3" />
                <Text className={`text-center text-gray-600 text-sm mb-4 ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                  {language === 'ar' 
                    ? 'لم تقم بإضافة أي مواقع بعد. يرجى إضافة موقعك للبدء.' 
                    : 'You haven\'t added any locations yet. Please add your location to get started.'}
                </Text>
                <TouchableOpacity
                  onPress={handleAddNewLocation}
                  className="bg-orange-500 p-3 rounded-lg w-full"
                >
                  <Text className={`text-center text-white text-sm ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                    {language === 'ar' ? 'إضافة موقع جديد' : 'Add New Location'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* <StatusBar style="dark" /> */}
      <Header
        key={headerRefreshKey}
        title={t.home}
        showProfileImage={true}
        profileImageUrl={profileImageUrl}
        showSideMenu={true}
      />
      
      {/* Location Modal */}
      <LocationModal />

      <FlatList 
        data={[]}
        renderItem={() => null}
        keyboardShouldPersistTaps="handled" 
        contentContainerStyle={{ paddingTop: 0, paddingBottom: 100 }}
        ListHeaderComponent={
          <>
            <View 
              className="mx-2 mt-5"
              style={Platform.OS === 'android' ? styles.androidShadow : styles.iosShadow}
            >
              <GoogleTextInput
                icon={icons.search}
                containerStyle="bg-white rounded-xl"
                handlePress={handleDestinationPress}
                placeholder={t.searchPlaceholder}
                textInputBackgroundColor="white"
                onTextChange={handleSearchTextChange}
                autoFocus={false}
                returnKeyType="search"
                onSubmitEditing={(event) => {
                  if (event.nativeEvent.text) {
                    handleDestinationPress({
                      latitude: 0,
                      longitude: 0,
                      address: event.nativeEvent.text
                    });
                  }
                }}
              />
            </View>
              {/* Feature Cards Section */}
              <View className="mt-4 mb-4">
              
              <FeatureCards />
            </View>
            {isDriver && inProgressRides.length > 0 && (
              <>
                <View className={`flex-row items-center mt-5 mb-3 w-full px-3 ${language === 'ar' ? 'flex-row-reverse justify-between' : 'flex-row justify-between'}`}>
                  <Text className={`text-xl ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
                    {language === 'ar' ? 'الرحلات الحالية' : 'Current Rides'}
                  </Text>
                  <View className="bg-orange-500 w-7 h-7 items-center justify-center rounded-full">
                    <Text className={`text-white text-sm ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                      {inProgressRides.length}
                    </Text>
                  </View>
                </View>
                
                <FlatList
                  data={inProgressRides}
                  renderItem={({ item: ride }) => (
                    <TouchableOpacity
                      key={ride.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        router.push(`/(root)/ride-details/${ride.id}`);
                      }}
                      className="bg-white mx-3 mb-3 p-4 rounded-2xl shadow-lg"
                      style={{
                        elevation: 3,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 3.84,
                      }}
                    >
                      <View className={`flex-row items-center justify-between ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <View className="flex-1">
                          <View className={`flex-row items-center mb-2 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                            <View className="bg-green-100 px-2 py-1 rounded-full">
                              <Text className={`text-green-600 text-xs ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                                {language === 'ar' ? 'قيد التقدم' : 'In Progress'}
                              </Text>
                            </View>
                            <Text className={`text-gray-500 text-sm ${language === 'ar' ? 'font-CairoBold mr-2' : 'font-JakartaBold ml-2'}`}>
                              {ride.ride_datetime}
                            </Text>
                          </View>
                          <Text className={`text-gray-900 text-lg mb-1 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-CairoBold text-left'}`}>
                            {ride.destination_address}
                          </Text>
                          <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoBold text-right' : 'font-CairoRegular text-left'}`}>
                            {ride.origin_address}
                          </Text>
                          <Text className={`text-orange-500 text-sm mt-1 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
                            {language === 'ar' ? `المقاعد المتاحة: ${ride.available_seats}` : `Available seats: ${ride.available_seats}`}
                          </Text>
                        </View>
                        <View className={`items-center ${language === 'ar' ? 'ml-3' : 'mr-3'}`}>
                          <MaterialIcons name="navigation" size={24} color="#f97316" />
                          <Text className={`text-orange-500 text-xs mt-1 ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                            {language === 'ar' ? 'انتقل' : 'Navigate'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  )}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  horizontal={false}
                  contentContainerStyle={{ paddingHorizontal: 0 }}
                />
              </>
            )}

            <View className={`flex-row items-center mt-5 mb-3 w-full px-3 ${language === 'ar' ? 'flex-row-reverse justify-between' : 'flex-row justify-between'}`}>
              <View className={`${language === 'ar' ? 'items-end' : 'items-start'}`}>
                <Text className={`text-xl ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
                  {t.suggestedRides}
                </Text>
              </View>
              <View className={`${language === 'ar' ? 'items-start' : 'items-end'}`}>
                {isDriver && 
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    router.push('/(root)/all-rides');
                  }}
                  className="flex-row items-center px-1 py-1 rounded-[15px]"
                >
                  <Text className="font-CairoSemiBold">
                    {language === 'ar' ? 'عرض الكل' : 'View All'}
                  </Text>
                </TouchableOpacity>}
              </View>
            </View>
            <SuggestedRides ref={suggestedRidesRef} />
          </>
        }
        refreshControl={
          <RefreshControl 
            refreshing={isRefreshing} 
            onRefresh={onRefresh}
            colors={["#F87000"]}
            tintColor="#F87000"
            title={language === 'ar' ? 'جاري التحديث...' : 'Refreshing...'}
            titleColor="#F87000"
            progressViewOffset={20}
          />
        }
      />

      {isDriver && (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/(root)/add');
          }}
          className="absolute bottom-24 right-5 bg-orange-500 w-14 h-14 rounded-full items-center justify-center shadow-lg"
          style={{
            elevation: 5,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            zIndex: 1000,
          }}
        >
          <MaterialIcons name="add" size={30} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  androidShadow: {
    elevation: 8,
    backgroundColor: 'white',
    borderRadius: 20,
  },
  iosShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    backgroundColor: 'white',
    borderRadius: 20,
  },
});