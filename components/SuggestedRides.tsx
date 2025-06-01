import React, { useEffect, useState, useCallback, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, Text, Image, TouchableOpacity, FlatList, Platform, Animated, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { router, useRouter } from 'expo-router';
import { collection, query, getDocs, doc, getDoc, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { icons, images } from '@/constants';
import { StyleSheet } from 'react-native';
import { useLanguage } from '@/context/LanguageContext';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

// Updated Interfaces to match Firebase schema
interface DriverData {
  car_image_url?: string;
  car_seats: number;
  car_type: string;
  created_at: string;
  is_active: boolean;
  profile_image_url: string;
}

interface UserData {
  email: string;
  gender: string;
  industry: string;
  name: string;
  parent_email: string;
  phone: string;
  profile_image_url: string;
  pushToken: string;
  role: string;
  driver?: DriverData;
}

interface Ride {
  id: string;
  available_seats: number;
  cancelledAt?: string;
  completedAt?: string;
  created_at: any;
  destination_address: string;
  destination_latitude: number;
  destination_longitude: number;
  driver_id: string;
  is_recurring: boolean;
  no_children: boolean;
  no_music: boolean;
  no_smoking: boolean;
  origin_address: string;
  origin_latitude: number;
  origin_longitude: number;
  required_gender: string;
  ride_datetime: string;
  ride_days?: string[];
  ride_number: number;
  status: string;
  driver?: {
    name: string;
    car_seats: number;
    profile_image_url?: string;
    car_type: string;
  };
  priority?: number;
  distance?: number;
}

interface RideData {
  id: string;
  available_seats: number;
  cancelledAt?: string;
  completedAt?: string;
  created_at: any;
  destination_address: string;
  destination_latitude: number;
  destination_longitude: number;
  driver_id: string;
  is_recurring: boolean;
  no_children: boolean;
  no_music: boolean;
  no_smoking: boolean;
  origin_address: string;
  origin_latitude: number;
  origin_longitude: number;
  required_gender: string;
  ride_datetime: string;
  ride_days?: string[];
  ride_number: number;
  status: string;
}

interface RecentRoute {
  origin: string;
  destination: string;
  count: number;
}

// Constants
const DEFAULT_DRIVER_NAME = 'Unknown Driver';
const DEFAULT_CAR_SEATS = 4;
const DEFAULT_CAR_TYPE = 'Unknown';
const MAX_RIDES = 5;
const MAX_DISTANCE_KM = 10;
const VALID_STATUSES = ['available', 'full', 'in-progress', 'completed'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const DAY_TRANSLATIONS: { [key in typeof DAYS[number]]: string } = {
  Sunday: 'الأحد',
  Monday: 'الإثنين',
  Tuesday: 'الثلاثاء',
  Wednesday: 'الأربعاء',
  Thursday: 'الخميس',
  Friday: 'الجمعة',
  Saturday: 'السبت',
};

// Haversine formula to calculate distance
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const getDayOfWeek = (dateStr: string, lang: string): string => {
  try {
    if (!dateStr) return 'Unknown Day';
    const [datePart] = dateStr.split(' ');
    const [dayStr, monthStr, yearStr] = datePart.split('/');
    const date = new Date(`${yearStr}-${monthStr}-${dayStr}`);
    if (isNaN(date.getTime())) {
      console.error('Invalid date for day of week:', dateStr);
      return 'Unknown Day';
    }
    const dayIndex = date.getDay();
    const dayName = DAYS[dayIndex];
    return lang === 'ar' ? DAY_TRANSLATIONS[dayName] : dayName;
  } catch (error) {
    console.error('Error getting day of week:', error);
    return 'Unknown Day';
  }
};

const isFutureRide = (ride: RideData): boolean => {
  try {
    // Get the ride's date and time
    const [dateStr, timeStr] = ride.ride_datetime.split(' ');
    const [day, month, year] = dateStr.split('/').map(num => parseInt(num, 10));
    const [hours, minutes] = (timeStr || '00:00').split(':').map(num => parseInt(num, 10));

    // Create date objects
    const rideDate = new Date(year, month - 1, day, hours, minutes);
    const currentDate = new Date();

    // Log the comparison details
    console.log('Date Comparison:', {
      rideId: ride.id,
      rideDateTime: ride.ride_datetime,
      parsedRideDate: rideDate.toISOString(),
      currentDate: currentDate.toISOString(),
      isFuture: rideDate > currentDate
    });

    return rideDate > currentDate;
  } catch (error) {
    console.error('Error in isFutureRide:', error);
    return false;
  }
};

const RideSkeleton = () => {
  const animatedValue = new Animated.Value(0);
  const { language } = useLanguage();

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(animatedValue, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View
      className="bg-white p-4 rounded-2xl mb-3 mx-2"
      style={[Platform.OS === 'android' ? styles.androidShadow : styles.iosShadow, { opacity }]}
    >
      <View className={`absolute top-4 ${language === 'ar' ? 'left-4' : 'right-4'}`}>
        <View className="px-2 py-1 rounded-full bg-gray-100">
          <View className="h-4 w-16 bg-gray-200 rounded-full" />
        </View>
      </View>
      <View className={`flex-row items-center mb-3 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
        <View className={`w-10 h-10 rounded-full bg-gray-200 ${language === 'ar' ? 'ml-3' : 'mr-3'}`} />
        <View className={language === 'ar' ? 'items-end' : 'items-start'}>
          <View className="h-5 bg-gray-200 rounded-full w-32 mb-2" />
          <View className="h-4 bg-gray-200 rounded-full w-24" />
        </View>
      </View>
      <View className={`flex-row items-start mb-3 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
        <View className="flex-1">
          <View className={`flex-row items-center mb-1 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <View className={`w-5 h-5 rounded-full bg-gray-200 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
            <View className={`flex-1 ${language === 'ar' ? 'ml-2' : 'mr-2'}`}>
              <View className="h-4 bg-gray-200 rounded-full w-3/4" />
            </View>
          </View>
          <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <View className={`w-5 h-5 rounded-full bg-gray-200 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
            <View className={`flex-1 ${language === 'ar' ? 'ml-2' : 'mr-2'}`}>
              <View className="h-4 bg-gray-200 rounded-full w-3/4" />
            </View>
          </View>
        </View>
      </View>
      <View className={`flex-row justify-between items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
        <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className={`w-4 h-4 rounded-full bg-gray-200 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
          <View>
            <View className="h-4 bg-gray-200 rounded-full w-20 mb-1" />
            <View className="h-3 bg-gray-200 rounded-full w-16" />
          </View>
        </View>
        <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className={`w-4 h-4 rounded-full bg-gray-200 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
          <View className="h-4 bg-gray-200 rounded-full w-16" />
        </View>
        <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className={`w-4 h-4 rounded-full bg-gray-200 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
          <View className="h-4 bg-gray-200 rounded-full w-12" />
        </View>
      </View>
    </Animated.View>
  );
};

interface SuggestedRidesProps {}

export interface SuggestedRidesRef {
  refresh: () => Promise<void>;
}

const SuggestedRidesComponent = forwardRef<SuggestedRidesRef, SuggestedRidesProps>((props, ref) => {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [preferredLocations, setPreferredLocations] = useState<RecentRoute[]>([]);
  const { user } = useUser();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const formatTimeTo12Hour = (timeStr: string) => {
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = hours % 12 || 12;
      return `${formattedHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    } catch (error) {
      console.error('Error formatting time:', error);
      return timeStr;
    }
  };

  const fetchUserLocation = useCallback(async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      let location = await Location.getCurrentPositionAsync({});
      return { latitude: location.coords.latitude, longitude: location.coords.longitude };
    } catch (err) {
      console.error('Error fetching user location:', err);
      return null;
    }
  }, []);

  const fetchPastRides = useCallback(async () => {
    if (!user?.id) return [];
    try {
      const ridesRef = collection(db, 'rides');
      const rideRequestsRef = collection(db, 'ride_requests');

      const [driverRidesSnapshot, passengerRequestsSnapshot] = await Promise.all([
        getDocs(query(
          ridesRef,
          where('driver_id', '==', user.id),
          orderBy('ride_datetime', 'desc'),
          limit(20)
        )),
        getDocs(query(
          rideRequestsRef,
          where('user_id', '==', user.id),
          where('status', '==', 'accepted'),
          limit(20)
        ))
      ]);

      const driverRides = driverRidesSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() } as RideData))
        .filter(isFutureRide);

      const passengerRideIds = [...new Set(
        passengerRequestsSnapshot.docs
          .map((doc) => doc.data().ride_id)
          .filter((id): id is string => !!id)
      )];

      const passengerRides = (await Promise.all(
        passengerRideIds.map(async (rideId) => {
          const rideDoc = await getDoc(doc(db, 'rides', rideId));
          if (!rideDoc.exists()) return null;
          const rideData = { id: rideId, ...rideDoc.data() } as RideData;
          return isFutureRide(rideData) ? rideData : null;
        })
      )).filter((ride): ride is RideData => ride !== null);

      return [...driverRides, ...passengerRides];
    } catch (err) {
      console.error('Error fetching past rides:', err);
      return [];
    }
  }, [user?.id]);

  const getPreferredLocations = useCallback(
    (pastRides: RideData[]): RecentRoute[] => {
      const locations: { [key: string]: RecentRoute } = {};
      pastRides.forEach((ride) => {
        const originKey = ride.origin_address?.trim();
        const destinationKey = ride.destination_address?.trim();
        if (originKey && destinationKey) {
          const key = `${originKey}|${destinationKey}`;
          if (locations[key]) {
            locations[key].count += 1;
          } else {
            locations[key] = { origin: originKey, destination: destinationKey, count: 1 };
          }
        }
      });
      return Object.values(locations).sort((a, b) => b.count - a.count).slice(0, 3);
    },
    []
  );

  const getRidesWithDriverData = async (rides: RideData[]): Promise<Ride[]> => {
    const driverIds = new Set(rides.map((ride) => ride.driver_id).filter((id): id is string => !!id));
    const driverDataMap: { [key: string]: UserData } = {};
    
    await Promise.all(
      Array.from(driverIds).map(async (driverId) => {
        try {
          const driverDoc = await getDoc(doc(db, 'users', driverId));
          if (driverDoc.exists()) {
            driverDataMap[driverId] = driverDoc.data() as UserData;
          }
        } catch (err) {
          console.error(`Error fetching driver ${driverId}:`, err);
        }
      })
    );

    return rides.map((ride) => {
      const driverId = ride.driver_id;
      const driverData = driverId ? driverDataMap[driverId] : undefined;
      return {
        ...ride,
        driver: {
          name: driverData?.name || DEFAULT_DRIVER_NAME,
          car_seats: driverData?.driver?.car_seats || DEFAULT_CAR_SEATS,
          profile_image_url: driverData?.driver?.profile_image_url || '',
          car_type: driverData?.driver?.car_type || DEFAULT_CAR_TYPE,
        },
      };
    });
  };

  const fetchRides = useCallback(async () => {
    if (!user?.id) {
      setError(language === 'ar' ? 'المستخدم غير مصادق' : 'User not authenticated');
      setLoading(false);
      return;
    }

    if (!isMountedRef.current) return;

    try {
      setLoading(true);
      setError(null);

      const ridesRef = collection(db, 'rides');
      
      // Get all rides
      const ridesQuery = query(
        ridesRef,
        orderBy('ride_datetime', 'asc')
      );

      const ridesSnapshot = await getDocs(ridesQuery);
      console.log('Total rides fetched:', ridesSnapshot.docs.length);

      // Log all rides
      ridesSnapshot.docs.forEach(doc => {
        const ride = doc.data();
        console.log('Ride from DB:', {
          id: doc.id,
          datetime: ride.ride_datetime,
          status: ride.status,
          available_seats: ride.available_seats
        });
      });

      // Filter future rides
      let ridesData = ridesSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as RideData))
        .filter(ride => {
          const isFuture = isFutureRide(ride);
          console.log(`Ride ${ride.id} future check:`, {
            datetime: ride.ride_datetime,
            isFuture,
            status: ride.status,
            available_seats: ride.available_seats
          });
          return isFuture;
        });

      console.log('Future rides count:', ridesData.length);

      if (ridesData.length === 0) {
        if (isMountedRef.current) {
          setError(language === 'ar' ? 'لا توجد رحلات متاحة' : 'No rides available');
          setRides([]);
        }
        return;
      }

      // Get driver data
      const ridesWithDriverData = await getRidesWithDriverData(ridesData);
      console.log('Rides with driver data:', ridesWithDriverData.length);

      // Sort and limit rides
      const suggestedRides = ridesWithDriverData
        .sort((a, b) => {
          const [dateA, timeA] = a.ride_datetime.split(' ');
          const [dateB, timeB] = b.ride_datetime.split(' ');
          const [dayA, monthA, yearA] = dateA.split('/').map(Number);
          const [dayB, monthB, yearB] = dateB.split('/').map(Number);
          const [hoursA, minutesA] = timeA.split(':').map(Number);
          const [hoursB, minutesB] = timeB.split(':').map(Number);
          
          const dateObjA = new Date(yearA, monthA - 1, dayA, hoursA, minutesA);
          const dateObjB = new Date(yearB, monthB - 1, dayB, hoursB, minutesB);
          
          return dateObjA.getTime() - dateObjB.getTime();
        })
        .slice(0, MAX_RIDES);

      console.log('Final rides to display:', suggestedRides.length);
      suggestedRides.forEach(ride => {
        console.log('Final ride:', {
          id: ride.id,
          datetime: ride.ride_datetime,
          status: ride.status,
          available_seats: ride.available_seats
        });
      });

      if (isMountedRef.current) {
        setRides(suggestedRides);
      }
    } catch (err) {
      console.error('Error fetching rides:', err);
      if (isMountedRef.current) {
        setError(language === 'ar' ? 'فشل في تحميل الرحلات' : 'Failed to load rides');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [user?.id, language]);

  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  useImperativeHandle(ref, () => ({
    refresh: async () => {
      await fetchRides();
    }
  }));

  const renderRideCard = ({ item }: { item: Ride }) => {
    const [date, time] = item.ride_datetime.split(' ') || ['Unknown Date', 'Unknown Time'];
    const formattedTime = time.includes(':') ? formatTimeTo12Hour(time) : time;
    const dayOfWeek = getDayOfWeek(item.ride_datetime, language);

    const getStatusColor = (status: string) => {
      switch (status) {
        case 'available':
          return { bg: 'bg-green-50', text: 'text-green-600' };
        case 'in-progress':
          return { bg: 'bg-blue-50', text: 'text-blue-600' };
        case 'completed':
          return { bg: 'bg-purple-50', text: 'text-purple-600' };
        case 'cancelled':
          return { bg: 'bg-red-50', text: 'text-red-600' };
        case 'full':
          return { bg: 'bg-red-50', text: 'text-red-600' };
        case 'on-hold':
          return { bg: 'bg-orange-50', text: 'text-orange-600' };
        default:
          return { bg: 'bg-gray-50', text: 'text-gray-600' };
      }
    };

    const getStatusText = (status: string) => {
      switch (status) {
        case 'available':
          return language === 'ar' ? 'متاح' : 'Available';
        case 'in-progress':
          return language === 'ar' ? 'قيد التنفيذ' : 'In Progress';
        case 'completed':
          return language === 'ar' ? 'مكتمل' : 'Completed';
        case 'cancelled':
          return language === 'ar' ? 'ملغي' : 'Cancelled';
        case 'full':
          return language === 'ar' ? 'ممتلئ' : 'Full';
        case 'on-hold':
          return language === 'ar' ? 'معلق' : 'On Hold';
        default:
          return language === 'ar' ? 'غير معروف' : 'Unknown';
      }
    };

    const statusColors = getStatusColor(item.status);
    const statusText = getStatusText(item.status);

    return (
      <TouchableOpacity
        onPress={() => router.push(`/ride-details/${item.id}`)}
        className="bg-white p-4 rounded-2xl mb-3 mx-2"
        style={Platform.OS === 'android' ? styles.androidShadow : styles.iosShadow}
      >
        <View className={`absolute top-4 ${language === 'ar' ? 'left-4' : 'right-4'}`}>
          <View className={`px-2 pt-2 pb-1  rounded-full ${statusColors.bg}`}>
            <Text className={`text-xs font-CairoMedium ${statusColors.text}`}>
              {item.is_recurring ? (language === 'ar' ? 'متكرر' : 'Recurring') : statusText}
            </Text>
          </View>
        </View>
        <View className={`flex-row items-center mb-3 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <Image
            source={item.driver?.profile_image_url ? { uri: item.driver.profile_image_url } : icons.profile}
            className={`w-10 h-10 rounded-full ${language === 'ar' ? 'ml-3' : 'mr-3'}`}
          />
          <View className={language === 'ar' ? 'items-end' : 'items-start'}>
            <Text className={`text-base font-CairoBold ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {item.driver?.name || DEFAULT_DRIVER_NAME}
            </Text>
            <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {item.driver?.car_type || DEFAULT_CAR_TYPE}
            </Text>
          </View>
        </View>
        <View className={`flex-row items-start mb-3 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className="flex-1">
            <View className={`flex-row items-center mb-1 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <Image source={icons.point} className={`w-5 h-5 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
              <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'font-CairoBold ml-2' : 'mr-2'}`}>
                {language === 'ar' ? 'من' : 'From'}:
              </Text>
              <Text
                className={`text-base font-CairoMedium flex-1 ${language === 'ar' ? 'text-right' : 'text-left'}`}
                numberOfLines={1}
              >
                {item.origin_address}
              </Text>
            </View>
            <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <Image source={icons.target} className={`w-5 h-5 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
              <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'font-CairoBold ml-2' : 'mr-2'}`}>
                {language === 'ar' ? 'إلى' : 'To'}:
              </Text>
              <Text
                className={`text-base font-CairoMedium flex-1 ${language === 'ar' ? 'text-right' : 'text-left'}`}
                numberOfLines={1}
              >
                {item.destination_address}
              </Text>
            </View>
          </View>
        </View>
        <View className={`flex-row justify-between items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <Image source={icons.calendar} className={`w-4 h-4 mb-1 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
            <View>
              <Text className={`text-sm pt-5 text-gray-600 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {dayOfWeek}
              </Text>
              <Text className={`text-sm mt-1 font-Bold text-gray-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {date}
              </Text>
            </View>
          </View>
          <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <Image source={icons.clock} className={`w-4 h-4 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
            <Text className={`text-sm text-gray-600 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {formattedTime}
            </Text>
          </View>
          <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <Image source={icons.person} className={`w-4 h-4 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
            <Text className={`text-sm text-gray-600 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {item.available_seats} {language === 'ar' ? 'مقاعد' : t.seats}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center py-4">
        <ActivityIndicator size="large" color="#F8780D" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center py-4">
        <Text className={`text-red-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>{error}</Text>
        <TouchableOpacity 
          onPress={fetchRides} 
          className="mt-4 bg-orange-500 px-4 py-2 rounded-full"
        >
          <Text className="text-white font-CairoMedium">
            {language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (rides.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-4">
        <Ionicons name="search-outline" size={64} color="#9CA3AF" />
        <Text className={`text-gray-500 text-center mt-4 font-CairoMedium ${language === 'ar' ? 'text-right' : 'text-left'}`}>
          {language === 'ar' ? 'لا توجد رحلات متاحة' : 'No rides available'}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={rides}
      renderItem={renderRideCard}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 16 }}
      extraData={language}
    />
  );
});

SuggestedRidesComponent.displayName = 'SuggestedRides';

const styles = StyleSheet.create({
  androidShadow: { elevation: 5 },
  iosShadow: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
});

export default SuggestedRidesComponent;