import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image, SectionList, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@/lib/firebase';
import { useAuth } from '@clerk/clerk-expo';
import { formatTime, formatDate } from '@/lib/utils';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import Header from '@/components/Header';
import { LinearGradient } from 'expo-linear-gradient';
import { icons } from '@/constants';
import { useLanguage } from '@/context/LanguageContext';

interface Ride {
  id: string;
  origin_address: string;
  destination_address: string;
  origin_street?: string;
  destination_street?: string;
  ride_datetime: string;
  status: string;
  driver_id: string;
  available_seats: number;
  fare_price: number;
  origin_latitude: number;
  origin_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  created_at: Date;
  updated_at: Date;
  is_recurring: boolean;
  no_children: boolean;
  no_music: boolean;
  no_smoking: boolean;
  required_gender: string;
  ride_days: string[];
  ride_number: number;
  user_id: string;
  driver?: {
    name: string;
    profile_image_url: string;
  };
  waypoints?: Array<{
    address: string;
    street?: string;
    latitude: number;
    longitude: number;
  }>;
}

interface RideWithRequests extends Ride {
  requests?: {
    id: string;
    status: string;
    user_id: string;
    user_name?: string;
    user_image?: string;
  }[];
}

interface CachedData {
  upcomingRides: RideWithRequests[];
  pastDriverRides: RideWithRequests[];
  pastPassengerRides: RideWithRequests[];
  timestamp: number;
}

const SkeletonRideCard = () => (
  <View className="mb-4 mx-4">
    <View className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <View className="absolute top-4 right-4 w-20 h-6 bg-gray-200 rounded-full" />
      
      <View className="p-4">
        {/* Origin */}
        <View className="flex-row items-center mb-4">
          <View className="w-8 h-8 bg-gray-200 rounded-full mr-3" />
          <View className="flex-1">
            <View className="h-5 w-48 bg-gray-200 rounded mb-1" />
            <View className="h-4 w-32 bg-gray-200 rounded" />
          </View>
        </View>

        {/* Destination */}
        <View className="flex-row items-center mb-4">
          <View className="w-8 h-8 bg-gray-200 rounded-full mr-3" />
          <View className="flex-1">
            <View className="h-5 w-48 bg-gray-200 rounded mb-1" />
            <View className="h-4 w-32 bg-gray-200 rounded" />
          </View>
        </View>

        {/* Date and Time */}
        <View className="flex-row justify-between ml-2 items-center mb-3">
          <View className="flex-row items-center">
            <View className="w-8 h-8 bg-gray-200 rounded-full mr-3" />
            <View>
              <View className="h-4 w-24 bg-gray-200 rounded mb-1" />
              <View className="h-3 w-20 bg-gray-200 rounded" />
            </View>
          </View>
          <View className="flex-row items-center">
            <View className="h-4 w-16 bg-gray-200 rounded mr-3" />
            <View className="w-8 h-8 bg-gray-200 rounded-full" />
          </View>
        </View>

        {/* Seats */}
        <View className="flex-row items-center ml-2 justify-between mb-3">
          <View className="flex-row items-center">
            <View className="w-4 h-4 bg-gray-200 rounded mr-2" />
            <View className="h-4 w-24 bg-gray-200 rounded" />
          </View>
        </View>

        {/* Driver Info */}
        <View className="mt-4 flex-row items-center border-t border-gray-100 pt-4">
          <View className="w-10 h-10 bg-gray-200 rounded-full mr-3" />
          <View>
            <View className="h-4 w-32 bg-gray-200 rounded mb-1" />
            <View className="h-3 w-24 bg-gray-200 rounded" />
          </View>
        </View>
      </View>
    </View>
  </View>
);

const SkeletonFilterButtons = () => (
  <View className="bg-white py-2 border-b border-gray-100">
    <ScrollView 
      horizontal 
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16 }}
    >
      {[1, 2, 3, 4].map((_, index) => (
        <View key={index} className="h-10 w-24 bg-gray-200 rounded-full mr-3" />
      ))}
    </ScrollView>
  </View>
);

export default function Rides() {
  const router = useRouter();
  const { userId } = useAuth();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [isDriver, setIsDriver] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [upcomingRides, setUpcomingRides] = useState<RideWithRequests[]>([]);
  const [pastDriverRides, setPastDriverRides] = useState<RideWithRequests[]>([]);
  const [pastPassengerRides, setPastPassengerRides] = useState<RideWithRequests[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'completed' | 'cancelled'>('all');
  const [rideTypeFilter, setRideTypeFilter] = useState<'all' | 'created' | 'registered'>('all');
  const [pastRideTypeFilter, setPastRideTypeFilter] = useState<'all' | 'drove' | 'joined'>('all');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const { t, language } = useLanguage();

  // Cache helper functions
  const cacheRidesData = async (data: CachedData) => {
    try {
      await AsyncStorage.setItem(`rides_${userId}`, JSON.stringify({ ...data, timestamp: Date.now() }));
    } catch (err) {
      console.error('Error caching rides data:', err);
    }
  };

  const getCachedRidesData = async (): Promise<CachedData | null> => {
    try {
      const cached = await AsyncStorage.getItem(`rides_${userId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
          return parsed;
        }
      }
      return null;
    } catch (err) {
      console.error('Error retrieving cached rides data:', err);
      return null;
    }
  };

  const clearCache = async () => {
    try {
      await AsyncStorage.removeItem(`rides_${userId}`);
    } catch (err) {
      console.error('Error clearing cache:', err);
    }
  };

  // Check if user is a driver
  const checkIfUserIsDriver = useCallback(async () => {
    if (!userId) {
      console.log('No user ID found');
      return;
    }
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const isActiveDriver = userData.driver?.is_active === true;
        setIsDriver(isActiveDriver);
        console.log('Driver status:', isActiveDriver);
      }
    } catch (error) {
      console.error('Error checking driver status:', error);
    }
  }, [userId]);

  // Parse ride_datetime safely
  const parseRideDateTime = (ride_datetime: string): Date | null => {
    try {
      if (ride_datetime.includes('T')) {
        const date = new Date(ride_datetime);
        return isNaN(date.getTime()) ? null : date;
      }
      const [datePart, timePart] = ride_datetime.split(' ');
      if (datePart && timePart) {
        const [day, month, year] = datePart.split('/').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        const date = new Date(year, month - 1, day, hours, minutes);
        return isNaN(date.getTime()) ? null : date;
      }
      return null;
    } catch (error) {
      console.error(`Error parsing ride_datetime: ${ride_datetime}`, error);
      return null;
    }
  };

  // Format time with AM/PM
  const formatTimeWithPeriod = (dateTimeString: string): string => {
    const date = parseRideDateTime(dateTimeString);
    if (!date) return '';
    
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
    
    // Standard format: 9:30
    let timeStr = `${hours === 0 ? 12 : hours > 12 ? hours - 12 : hours}:${formattedMinutes}`;
    
    // Add period indicator based on language
    if (language === 'ar') {
      timeStr += hours >= 12 ? ' م' : ' ص'; // Arabic: ص for AM, م for PM
    } else {
      timeStr += hours >= 12 ? ' PM' : ' AM'; // English: AM/PM
    }
    
    return timeStr;
  };
  
  // Format date with month name
  const formatDateWithMonth = (dateTimeString: string): string => {
    const date = parseRideDateTime(dateTimeString);
    if (!date) return '';
    
    const day = date.getDate();
    const month = date.getMonth();
    const year = date.getFullYear();
    
    // Month names in Arabic and English
    const arabicMonths = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    
    const englishMonths = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    // Format based on language
    if (language === 'ar') {
      return `${day} ${arabicMonths[month]} ${year}`;
    } else {
      return `${day} ${englishMonths[month]} ${year}`;
    }
  };

  // Fetch rides (driver and passenger)
  const fetchRides = useCallback(async () => {
    if (!userId) {
      console.log('No userId provided');
      return;
    }

    setLoading(true);
    try {
      await clearCache();

      const now = new Date();
      const ridesRef = collection(db, 'rides');
      const rideRequestsRef = collection(db, 'ride_requests');

      const driverRidesQuery = query(
        ridesRef,
        where('driver_id', '==', userId),
        orderBy('ride_datetime', 'desc'),
        limit(20)
      );

      const passengerRequestsQuery = query(
        rideRequestsRef,
        where('user_id', '==', userId),
        where('status', 'in', ['accepted', 'checked_in', 'checked_out']),
        limit(20)
      );

      const [driverRidesSnapshot, passengerRequestsSnapshot] = await Promise.all([
        getDocs(driverRidesQuery),
        getDocs(passengerRequestsQuery)
      ]);

      console.log('Driver rides fetched:', driverRidesSnapshot.size);
      console.log('Passenger requests fetched:', passengerRequestsSnapshot.size);

      const driverRides: RideWithRequests[] = await Promise.all(
        driverRidesSnapshot.docs.map(async (rideDoc) => {
          const rideData = rideDoc.data() as Ride;
          const rideId = rideDoc.id;

          const requestsQuery = query(
            rideRequestsRef,
            where('ride_id', '==', rideId),
            where('status', 'in', ['waiting', 'accepted', 'checked_in', 'checked_out'])
          );
          const requestsSnapshot = await getDocs(requestsQuery);

          const requests = await Promise.all(
            requestsSnapshot.docs.map(async (requestDoc) => {
              const requestData = requestDoc.data();
              const userDoc = await getDoc(doc(db, 'users', requestData.user_id));
              const userData = userDoc.data();
              return {
                id: requestDoc.id,
                status: requestData.status,
                user_id: requestData.user_id,
                user_name: userData?.name,
                user_image: userData?.profile_image_url,
              };
            })
          );

          return {
            ...rideData,
            id: rideId,
            requests,
            created_at: rideData.created_at instanceof Date ? rideData.created_at : new Date(rideData.created_at),
            updated_at: rideData.updated_at instanceof Date ? rideData.updated_at : new Date(rideData.updated_at),
            is_recurring: rideData.is_recurring || false,
          };
        })
      );

      const passengerRideIds = passengerRequestsSnapshot.docs.map((doc) => doc.data().ride_id);
      const uniqueRideIds = [...new Set(passengerRideIds)];

      const passengerRidesWithNulls = await Promise.all(
        uniqueRideIds.map(async (rideId) => {
          const rideDoc = await getDoc(doc(db, 'rides', rideId));
          if (!rideDoc.exists()) return null;

          const rideData = rideDoc.data() as Ride;
          const driverDoc = await getDoc(doc(db, 'users', rideData.driver_id));
          const driverData = driverDoc.data();

          return {
            ...rideData,
            id: rideId,
            driver: {
              name: driverData?.name || 'Unknown Driver',
              profile_image_url: driverData?.profile_image_url || 'https://via.placeholder.com/40',
            },
            requests: [],
            created_at: rideData.created_at instanceof Date ? rideData.created_at : new Date(rideData.created_at),
            updated_at: rideData.updated_at instanceof Date ? rideData.updated_at : new Date(rideData.updated_at),
            is_recurring: rideData.is_recurring || false,
            waypoints: rideData.waypoints || [],
          };
        })
      );

      const passengerRides: RideWithRequests[] = passengerRidesWithNulls.filter((ride): ride is RideWithRequests => ride !== null);

      const allRides = [...driverRides, ...passengerRides];

      // Updated logic for categorizing rides
      const upcoming = allRides.filter((ride) => {
        const rideDate = parseRideDateTime(ride.ride_datetime);
        if (!rideDate) {
          return false;
        }

        // Check if the ride is completed/ended/cancelled
        const isCompleted = ['completed', 'ended', 'cancelled'].includes(ride.status);
        
        // If the ride is completed/ended/cancelled, it should go to past section
        if (isCompleted) {
          return false;
        }

        // For all rides (including recurring), check if the date is in the future
        return rideDate > now;
      });

      const past = allRides.filter((ride) => {
        const rideDate = parseRideDateTime(ride.ride_datetime);
        if (!rideDate) {
          return false;
        }

        // Include in past if:
        // 1. The ride is completed/ended/cancelled OR
        // 2. The ride date is in the past (for all rides including recurring)
        const isCompleted = ['completed', 'ended', 'cancelled'].includes(ride.status);
        const isPast = rideDate <= now;

        return isCompleted || isPast;
      });

      const pastDriver = past.filter((ride) => ride.driver_id === userId);
      const pastPassenger = past.filter((ride) => ride.driver_id !== userId);

      console.log('Upcoming rides:', upcoming.length);
      console.log('Past driver rides:', pastDriver.length);
      console.log('Past passenger rides:', pastPassenger.length);

      setUpcomingRides(upcoming);
      setPastDriverRides(pastDriver);
      setPastPassengerRides(pastPassenger);

      await cacheRidesData({
        upcomingRides: upcoming,
        pastDriverRides: pastDriver,
        pastPassengerRides: pastPassenger,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Error fetching rides:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await clearCache();
    await Promise.all([checkIfUserIsDriver(), fetchRides()]);
    setRefreshing(false);
  }, [checkIfUserIsDriver, fetchRides]);

  const renderRideCard = useCallback(
    ({ item }: { item: RideWithRequests }) => {
      // Translate English days to Arabic
      const dayTranslations: { [key: string]: string } = {
        Monday: 'الإثنين',
        Tuesday: 'الثلاثاء',
        Wednesday: 'الأربعاء',
        Thursday: 'الخميس',
        Friday: 'الجمعة',
        Saturday: 'السبت',
        Sunday: 'الأحد',
      };

      // English day names
      const englishDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      // Arabic day names
      const arabicDays = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

      // Format ride_days for display
      const formattedRideDays = item.ride_days?.length
        ? language === 'ar' 
          ? item.ride_days.map(day => dayTranslations[day] || day).join('، ')
          : item.ride_days.join(', ')
        : t.daysNotSpecified;

      // Get status text based on language
      const getStatusText = (status: string) => {
        if (language === 'ar') {
          switch(status) {
            case 'available': return 'متاح';
            case 'completed': return 'مكتمل';
            default: return 'منتهي';
          }
        } else {
          switch(status) {
            case 'available': return 'Available';
            case 'completed': return 'Completed';
            default: return 'Ended';
          }
        }
      };

      return (
        <TouchableOpacity
          onPress={() => {
            if (Platform.OS === 'android') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            router.push({
              pathname: '/(root)/ride-details/[id]',
              params: { id: item.id },
            });
          }}
          className="mb-4 mx-4"
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={['#FFFFFF', '#F8F8F8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-2xl overflow-hidden border-2 border-gray-100"
            style={{
              elevation: Platform.OS === "android" ? 6 : 0,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.15,
              shadowRadius: 4.65,
              transform: [{ scale: 1 }], // This will be animated on press
            }}
          >
            <View
              className={`absolute top-4 ${language === 'ar' ? 'left-4' : 'right-4'} px-3 py-1 rounded-full ${
                item.status === 'available' ? 'bg-[#E6F4EA]' :
                item.status === 'completed' ? 'bg-[#E8F0FE]' :
                'bg-[#FCE8E6]'
              }`}
              style={{
                elevation: Platform.OS === "android" ? 2 : 0,
                shadowColor: item.status === 'available' ? "#1E8E3E" :
                           item.status === 'completed' ? "#1A73E8" :
                           "#D93025",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 3,
              }}
            >
              <Text
                className={`text-xs ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} ${
                  item.status === 'available' ? 'text-[#1E8E3E]' :
                  item.status === 'completed' ? 'text-[#1A73E8]' :
                  'text-[#D93025]'
                }`}
              >
                {getStatusText(item.status)}
              </Text>
            </View>

            <View className="p-4">
              <View className="flex-row items-center mb-4">
                {language === 'ar' ? (
                  <>
                    <View
                      className="flex-1"
                      style={{
                        paddingLeft: (language as string) === 'ar' ? 60 : 0,
                        paddingRight: (language as string) === 'ar' ? 0 : 60,
                      }}
                    >
                      <Text className="text-base font-CairoMedium text-right" numberOfLines={1}>
                        {item.origin_address}
                      </Text>
                      {item.origin_street && (
                        <Text className="text-sm text-gray-500 font-CairoRegular mt-1 text-right" numberOfLines={1}>
                          {item.origin_street}
                        </Text>
                      )}
                    </View>
                    <View className="w-8 h-8 rounded-full items-center justify-center ml-3">
                      <Image source={icons.pin} className="w-5 h-5" resizeMode="contain" />
                    </View>
                  </>
                ) : (
                  <>
                    <View className="w-8 h-8 rounded-full items-center justify-center mr-3">
                      <Image source={icons.pin} className="w-5 h-5" resizeMode="contain" />
                    </View>
                    <View
                      className="flex-1"
                      style={{
                        paddingLeft: (language as string) === 'ar' ? 60 : 0,
                        paddingRight: (language as string) === 'ar' ? 0 : 60,
                      }}
                    >
                      <Text className="text-base font-JakartaMedium text-left" numberOfLines={1}>
                        {item.origin_address}
                      </Text>
                      {item.origin_street && (
                        <Text className="text-sm text-gray-500 font-CairoRegular mt-1 text-left" numberOfLines={1}>
                          {item.origin_street}
                        </Text>
                      )}
                    </View>
                  </>
                )}
              </View>

              {/* Add waypoints display */}
              {item.waypoints && item.waypoints.length > 0 && (
                <View className="mt-2 mb-2">
                  {/* Conditional rendering based on waypoint count */}
                  {item.waypoints.length > 1 ? (
                    // Case: More than one waypoint (label above the list)
                    <View>
                      <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} mb-2`}>
                        <Image source={icons.map} resizeMode="contain" tintColor="#F79824" className={`w-5 h-5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                        <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                          {language === 'ar' ? 'نقاط التوقف' : 'Waypoints'}:
                        </Text>
                      </View>
                      <View className={`flex-row flex-wrap ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} items-center`}>
                        {item.waypoints.map((waypoint, index) => (
                          <View key={index} className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} ${index > 0 ? (language === 'ar' ? 'mr-1' : 'ml-1') : ''}`}>
                            <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium' : 'font-CairoMedium'} ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                              {waypoint.address}
                            </Text>
                            {index < item.waypoints!.length - 1 && (
                              <View className={`mx-1 ${language === 'ar' ? 'transform rotate-180' : ''}`}>
                                <MaterialIcons name="arrow-forward" size={18} color="#F79824" />
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : (
                    // Case: Exactly one waypoint (label on the same line)
                    <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <Image source={icons.map} resizeMode="contain" tintColor="#F79824" className={`w-5 h-5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                      <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} ${language === 'ar' ? 'ml-2' : 'mr-2'}`}>
                        {language === 'ar' ? 'نقاط التوقف' : 'Waypoints'}:
                      </Text>
                      <View className={`flex-row flex-wrap ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} items-center`}>
                         {item.waypoints.map((waypoint, index) => (
                          <View key={index} className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} ${index > 0 ? (language === 'ar' ? 'mr-1' : 'ml-1') : ''}`}>
                            <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium' : 'font-CairoMedium'} ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                              {waypoint.address}
                            </Text>
                            {index < item.waypoints!.length - 1 && (
                              <View className={`mx-1 ${language === 'ar' ? 'transform rotate-180' : ''}`}>
                                <MaterialIcons name="arrow-forward" size={18} color="#F79824" />
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              )}

              <View className="flex-row items-center mb-4">
                {language === 'ar' ? (
                  <>
                    <View className="flex-1">
                      <Text className="text-base font-CairoMedium text-right" numberOfLines={1}>
                        {item.destination_address}
                      </Text>
                      {item.destination_street && (
                        <Text className="text-sm text-gray-500 font-CairoRegular mt-1 text-right" numberOfLines={1}>
                          {item.destination_street}
                        </Text>
                      )}
                    </View>
                    <View className="w-8 h-8 rounded-full items-center justify-center ml-3">
                      <Image source={icons.target} className="w-5 h-5" />
                    </View>
                  </>
                ) : (
                  <>
                    <View className="w-8 h-8 rounded-full items-center justify-center mr-3">
                      <Image source={icons.target} className="w-5 h-5" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-base font-JakartaMedium text-left" numberOfLines={1}>
                        {item.destination_address}
                      </Text>
                      {item.destination_street && (
                        <Text className="text-sm text-gray-500 font-JakartaRegular mt-1 text-left" numberOfLines={1}>
                          {item.destination_street}
                        </Text>
                      )}
                    </View>
                  </>
                )}
              </View>

              <View className="flex-row justify-between ml-2 items-center mb-3">
                {language === 'ar' ? (
                  <>
                    <View className="flex-row items-center">
                      <Image source={icons.calendar} className="w-4 h-4 mr-2" />
                      <View className="items-end">
                        <Text className={`text-sm text-gray-700 font-CairoBold`}>
                          {formatDateWithMonth(item.ride_datetime)}
                        </Text>
                        <Text className={`text-xs text-gray-500 font-CairoMedium`}>
                          {item.is_recurring ? formattedRideDays : (() => {
                            const date = parseRideDateTime(item.ride_datetime);
                            if (!date) return '';
                            return arabicDays[date.getDay()];
                          })()}
                        </Text>
                      </View>
                    </View>
                    <View className="flex-row items-center">
                      <Text className={`text-sm text-gray-500 font-CairoMedium ml-3`}>
                        {formatTimeWithPeriod(item.ride_datetime)}
                      </Text>
                      <View className="w-8 h-8 rounded-full items-center justify-center ml-3">
                        <Image source={icons.clock} className="w-5 h-5" />
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <View className="flex-row items-center">
                      <View className="w-8 h-8 rounded-full items-center justify-center mr-3">
                        <Image source={icons.clock} className="w-5 h-5" />
                      </View>
                      <Text className="text-sm text-gray-500 font-JakartaMedium">
                        {formatTimeWithPeriod(item.ride_datetime)}
                      </Text>
                    </View>
                    <View className="flex-row items-center">
                      <Image source={icons.calendar} className="w-4 h-4 mr-2" />
                      <View className="items-start">
                        <Text className="text-sm text-gray-700 font-JakartaBold">
                          {formatDateWithMonth(item.ride_datetime)}
                        </Text>
                        <Text className="text-xs text-gray-500 font-JakartaMedium">
                          {item.is_recurring ? formattedRideDays : (() => {
                            const date = parseRideDateTime(item.ride_datetime);
                            if (!date) return '';
                            return englishDays[date.getDay()];
                          })()}
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
               
              <View className="flex-row items-center ml-2 justify-between mb-3">
                <View className="flex-row items-center">
                  <Image source={icons.person} className="w-4 h-4 mr-2" />
                  <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                    {`${item.available_seats} ${t.availableSeats}`}
                  </Text>
                </View>
                {item.is_recurring && (
                  <View className="flex-row items-center mt-1">
                    <Text className={`text-xs text-orange-500 ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                      {t.recurringTrip}
                    </Text>
                  </View>
                )}
              </View>

              {item.driver && (
                <View className="mt-4 flex-row items-center border-t border-gray-100 pt-4">
                  <Image source={{ uri: item.driver.profile_image_url }} className="w-10 h-10 rounded-full mr-3" />
                  <View>
                    <Text className={`text-sm ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>{item.driver.name}</Text>
                    <Text className={`text-xs text-gray-500 ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                      {item.driver_id === userId ? t.youAreTheDriver : t.theDriver}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    },
    [router, userId, language]
  );

  const renderEmptyState = useCallback(
    () => (
      <View className="flex-1 justify-center items-center p-8">
        <MaterialIcons name="directions-car" size={64} color="#EA580C" />
        <Text className={`text-xl ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-gray-900 mt-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
          {activeTab === 'upcoming' ? t.noUpcomingRides : t.noPastRides}
        </Text>
        <Text className={`text-gray-600 text-center mt-2 ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
          {activeTab === 'upcoming' ? t.upcomingRidesWillAppearHere : t.pastRidesWillAppearHere}
        </Text>
      </View>
    ),
    [activeTab, language, t]
  );

  const renderSectionHeader = useCallback(
    ({ section: { title } }: { section: { title: string } }) => (
      <View className="bg-gray-100 px-4 py-2">
        <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-gray-900 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
          {title === t.ridesYouDrove ? t.ridesYouDrove : t.ridesYouJoined}
        </Text>
      </View>
    ),
    [language, t]
  );

  const renderPastRideTypeFilter = () => (
    <View className="bg-white py-2 border-b border-gray-100">
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        <TouchableOpacity
          onPress={() => setPastRideTypeFilter('all')}
          className={`flex-row items-center px-4 py-2 rounded-full mr-3 ${
            pastRideTypeFilter === 'all' ? 'bg-orange-500' : 'bg-gray-100'
          }`}
        >
          <MaterialIcons 
            name="history" 
            size={16} 
            color={pastRideTypeFilter === 'all' ? 'white' : '#374151'} 
          />
          <Text className={`text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} mr-1 ${
            pastRideTypeFilter === 'all' ? 'text-white' : 'text-gray-700'
          }`}>
            {t.all}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setPastRideTypeFilter('drove')}
          className={`flex-row items-center px-4 py-2 rounded-full mr-3 ${
            pastRideTypeFilter === 'drove' ? 'bg-orange-500' : 'bg-gray-100'
          }`}
        >
          <MaterialIcons 
            name="person" 
            size={16} 
            color={pastRideTypeFilter === 'drove' ? 'white' : '#374151'} 
          />
          <Text className={`text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} mr-1 ${
            pastRideTypeFilter === 'drove' ? 'text-white' : 'text-gray-700'
          }`}>
            {t.ridesYouDrove}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setPastRideTypeFilter('joined')}
          className={`flex-row items-center px-4 py-2 rounded-full mr-3 ${
            pastRideTypeFilter === 'joined' ? 'bg-orange-500' : 'bg-gray-100'
          }`}
        >
          <MaterialIcons 
            name="group" 
            size={16} 
            color={pastRideTypeFilter === 'joined' ? 'white' : '#374151'} 
          />
          <Text className={`text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} mr-1 ${
            pastRideTypeFilter === 'joined' ? 'text-white' : 'text-gray-700'
          }`}>
            {t.ridesYouJoined}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  const pastRidesSections = useMemo(() => {
    let sections = [];
    
    // Filter rides based on pastRideTypeFilter
    let filteredDriverRides = pastDriverRides;
    let filteredPassengerRides = pastPassengerRides;

    if (pastRideTypeFilter === 'drove') {
      filteredPassengerRides = [];
    } else if (pastRideTypeFilter === 'joined') {
      filteredDriverRides = [];
    }

    if (filteredDriverRides.length > 0) {
      sections.push({
        title: t.ridesYouDrove,
        data: filteredDriverRides,
      });
    }

    if (filteredPassengerRides.length > 0) {
      sections.push({
        title: t.ridesYouJoined,
        data: filteredPassengerRides,
      });
    }

    return sections;
  }, [pastDriverRides, pastPassengerRides, pastRideTypeFilter, t]);

  const currentData = useMemo(() => {
    let filteredRides = activeTab === 'upcoming' ? upcomingRides : [];
    
    // Apply status filter
    if (statusFilter !== 'all') {
      filteredRides = filteredRides.filter(ride => ride.status === statusFilter);
    }

    // Apply ride type filter
    if (rideTypeFilter !== 'all') {
      filteredRides = filteredRides.filter(ride => {
        if (rideTypeFilter === 'created') {
          return ride.driver_id === userId;
        } else {
          return ride.driver_id !== userId;
        }
      });
    }

    // Sort by date (most recent first)
    return filteredRides.sort((a, b) => {
      const dateA = parseRideDateTime(a.ride_datetime);
      const dateB = parseRideDateTime(b.ride_datetime);
      if (!dateA || !dateB) return 0;
      return dateB.getTime() - dateA.getTime();
    });
  }, [activeTab, upcomingRides, statusFilter, rideTypeFilter, userId]);

  const renderRideTypeFilter = () => (
    <View className="bg-white py-2 border-b border-gray-100">
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        <TouchableOpacity
          onPress={() => setRideTypeFilter('all')}
          className={`flex-row items-center px-4 py-2 rounded-full mr-3 ${
            rideTypeFilter === 'all' ? 'bg-orange-500' : 'bg-gray-100'
          }`}
        >
          <MaterialIcons 
            name="directions-car" 
            size={16} 
            color={rideTypeFilter === 'all' ? 'white' : '#374151'} 
          />
          <Text className={`text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} mr-1 ${
            rideTypeFilter === 'all' ? 'text-white' : 'text-gray-700'
          }`}>
            {t.allRides}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setRideTypeFilter('created')}
          className={`flex-row items-center px-4 py-2 rounded-full mr-3 ${
            rideTypeFilter === 'created' ? 'bg-orange-500' : 'bg-gray-100'
          }`}
        >
          <MaterialIcons 
            name="person" 
            size={16} 
            color={rideTypeFilter === 'created' ? 'white' : '#374151'} 
          />
          <Text className={`text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} mr-1 ${
            rideTypeFilter === 'created' ? 'text-white' : 'text-gray-700'
          }`}>
            {t.myRides}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setRideTypeFilter('registered')}
          className={`flex-row items-center px-4 py-2 rounded-full mr-3 ${
            rideTypeFilter === 'registered' ? 'bg-orange-500' : 'bg-gray-100'
          }`}
        >
          <MaterialIcons 
            name="group" 
            size={16} 
            color={rideTypeFilter === 'registered' ? 'white' : '#374151'} 
          />
          <Text className={`text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} mr-1 ${
            rideTypeFilter === 'registered' ? 'text-white' : 'text-gray-700'
          }`}>
            {t.registeredRides}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  const renderStatusFilter = () => (
    <View className="bg-white py-3 border-b border-gray-100">
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        <TouchableOpacity
          onPress={() => setStatusFilter('all')}
          className={`flex-row items-center px-4 py-2 rounded-full mr-3 ${
            statusFilter === 'all' ? 'bg-orange-500' : 'bg-gray-100'
          }`}
        >
          <MaterialIcons 
            name="filter-list" 
            size={16} 
            color={statusFilter === 'all' ? 'white' : '#374151'} 
          />
          <Text className={`text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} mr-1 ${
            statusFilter === 'all' ? 'text-white' : 'text-gray-700'
          }`}>
            {t.all}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setStatusFilter('available')}
          className={`flex-row items-center px-4 py-2 rounded-full mr-3 ${
            statusFilter === 'available' ? 'bg-green-500' : 'bg-gray-100'
          }`}
        >
          <MaterialIcons 
            name="check-circle" 
            size={16} 
            color={statusFilter === 'available' ? 'white' : '#374151'} 
          />
          <Text className={`text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} mr-1 ${
            statusFilter === 'available' ? 'text-white' : 'text-gray-700'
          }`}>
            {t.available}
          </Text>
        </TouchableOpacity>

       

        <TouchableOpacity
          onPress={() => setStatusFilter('completed')}
          className={`flex-row items-center px-4 py-2 rounded-full mr-3 ${
            statusFilter === 'completed' ? 'bg-blue-500' : 'bg-gray-100'
          }`}
        >
          <MaterialIcons 
            name="done-all" 
            size={16} 
            color={statusFilter === 'completed' ? 'white' : '#374151'} 
          />
          <Text className={`text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} mr-1 ${
            statusFilter === 'completed' ? 'text-white' : 'text-gray-700'
          }`}>
            {t.completed}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setStatusFilter('cancelled')}
          className={`flex-row items-center px-4 py-2 rounded-full mr-3 ${
            statusFilter === 'cancelled' ? 'bg-red-500' : 'bg-gray-100'
          }`}
        >
          <MaterialIcons 
            name="cancel" 
            size={16} 
            color={statusFilter === 'cancelled' ? 'white' : '#374151'} 
          />
          <Text className={`text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} mr-1 ${
            statusFilter === 'cancelled' ? 'text-white' : 'text-gray-700'
          }`}>
            {t.cancelled}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  useEffect(() => {
    checkIfUserIsDriver();
  }, [checkIfUserIsDriver]);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (userId) {
        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setProfileImageUrl(userData.profile_image_url || userData.driver?.profile_image_url || null);
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      }
    };
    fetchUserProfile();
  }, [userId]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header profileImageUrl={profileImageUrl} title={t.Rides} />

        <View className="flex-row justify-around items-center px-4 py-2 border-b border-gray-200">
          <View className="h-8 w-24 bg-gray-200 rounded" />
          <View className="h-8 w-24 bg-gray-200 rounded" />
        </View>

        {activeTab === 'upcoming' && (
          <>
            <SkeletonFilterButtons />
            <SkeletonFilterButtons />
          </>
        )}

        <ScrollView 
          className="flex-1"
          contentContainerStyle={{ paddingVertical: 16 }}
          showsVerticalScrollIndicator={false}
        >
          <SkeletonRideCard />
          <SkeletonRideCard />
          <SkeletonRideCard />
          <SkeletonRideCard />
          <SkeletonRideCard />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header profileImageUrl={profileImageUrl} title={t.Rides} />

      <View className="flex-row justify-around items-center px-4 py-2 border-b border-gray-200">
        <TouchableOpacity
          onPress={() => setActiveTab('upcoming')}
          className={`flex-1 items-center py-3 ${activeTab === 'upcoming' ? 'border-b-2 border-orange-500' : ''}`}
        >
          <Text className={`${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} ${activeTab === 'upcoming' ? 'text-orange-500' : 'text-gray-500'}`}>
            {t.upcoming}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveTab('past')}
          className={`flex-1 items-center py-3 ${activeTab === 'past' ? 'border-b-2 border-orange-500' : ''}`}
        >
          <Text className={`${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} ${activeTab === 'past' ? 'text-orange-500' : 'text-gray-500'}`}>
            {t.past}
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'upcoming' ? (
        <>
          {renderRideTypeFilter()}
          {renderStatusFilter()}
        </>
      ) : (
        renderPastRideTypeFilter()
      )}

      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#F87000" />
        </View>
      ) : activeTab === 'upcoming' ? (
        <FlatList
          data={currentData}
          renderItem={renderRideCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 16, paddingBottom: 100 }}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F87000']} tintColor="#F87000" />
          }
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={true}
          updateCellsBatchingPeriod={50}
        />
      ) : (
        <SectionList
          sections={pastRidesSections}
          renderItem={renderRideCard}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 16, paddingBottom: 100 }}
          ListEmptyComponent={renderEmptyState}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F87000']} tintColor="#F87000" />
          }
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
          removeClippedSubviews={true}
          updateCellsBatchingPeriod={50}
        />
      )}
    </SafeAreaView>
  );
}