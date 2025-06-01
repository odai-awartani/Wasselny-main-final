import React, { useEffect, useState, useCallback, useRef } from "react";
import Map from "@/components/Map";
import RideCard from "@/components/RideCard";
import SuggestedRides, { SuggestedRidesRef } from "@/components/SuggestedRides";
import SuggestedRidesGrid from "@/components/SuggestedRidesGrid";
import { icons, images } from '@/constants';
import { useNotifications } from '@/context/NotificationContext';
import { useLocationStore } from "@/store";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Image, RefreshControl, TouchableOpacity, Alert, Platform, StyleSheet } from "react-native";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useDriverStore } from '@/store';
import { Ride } from "@/types/type";
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
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

  return (
    <SafeAreaView className="bg-general-500 flex-1">
      <Header 
        title={t.Home}
        profileImageUrl={profileImageUrl}
        showProfileImage={true}
        key={headerRefreshKey}
      />

      <FlatList 
        data={[]}
        renderItem={() => null}
        keyboardShouldPersistTaps="handled" 
        contentContainerStyle={{ paddingTop: 0, paddingBottom: 100 }}
        ListHeaderComponent={
          <>
            <TouchableOpacity 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                navigation.navigate('tabs', { screen: 'barriers' });
              }}
              className={`bg-orange-50 p-4 rounded-b-[20px] flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} justify-between shadow-lg`}
              style={{
                elevation: 3,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.25,
                shadowRadius: 3.84,
              }}
            >
              <View className="flex-1">
                <Text className={`text-gray-900 text-lg ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} mb-1`}>
                  {t.barriers}
                </Text>
                <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
                  {t.barriersDescription}
                </Text>
              </View>
              <View className="bg-orange-500 px-4 py-2 rounded-full">
                <Text className={`text-white ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                  {t.explore}
                </Text>
              </View>
            </TouchableOpacity>

            {/* <View className="mt-4">
              <Text className={`text-xl ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} mb-2 px-4`}>
                {language === 'ar' ? 'الرحلات المقترحة' : 'Suggested Rides'}
              </Text>
              <SuggestedRidesGrid refreshKey={refreshKey} />
            </View> */}

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

            <>
              <Text className={`text-xl px-3 mt-5 mb-3 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
                {t.currentLocation}
              </Text>
              <View className="flex flex-row items-center px-2 bg-transparent h-[300px]">
                {isMapLoading ? (
                  <View className="flex-1 h-full bg-gray-100 rounded-xl items-center justify-center">
                    <ActivityIndicator size="large" color="#F87000" />
                  </View>
                ) : (
                  <Map key={refreshKey} />
                )}
              </View>
            </>

            {!isCheckingDriver && !isDriver && (
              <TouchableOpacity 
                onPress={() => router.push('/(root)/driverInfo')}
                className={`bg-white p-4 rounded-2xl my-5 flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} justify-between shadow-lg`}
                style={{
                  elevation: 3,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.25,
                  shadowRadius: 3.84,
                }}
              >
                <View className="flex-1">
                  <Text className={`text-gray-900 text-lg ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} mb-1`}>
                    {t.becomeDriver}
                  </Text>
                  <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
                    {t.earnMoney}
                  </Text>
                </View>
                <View className="bg-orange-500 px-4 py-2 rounded-full">
                  <Text className={`text-white ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                    {t.register}
                  </Text>
                </View>
              </TouchableOpacity>
            )}

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

      <StatusBar backgroundColor="#F87000" style="dark" />
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