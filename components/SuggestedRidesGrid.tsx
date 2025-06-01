import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { router } from 'expo-router';
import { collection, query, getDocs, doc, getDoc, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { icons, images } from '@/constants';
import { StyleSheet } from 'react-native';
import { useLanguage } from '@/context/LanguageContext';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Reuse the same interfaces from SuggestedRides
interface DriverData {
  car_seats?: number;
  car_type?: string;
  profile_image_url?: string;
}

interface UserData {
  name?: string;
  driver?: DriverData;
}

interface Ride {
  id: string;
  origin_address: string;
  destination_address: string;
  created_at: any;
  ride_datetime: string;
  driver_id?: string;
  status: string;
  available_seats: number;
  origin_latitude: number;
  origin_longitude: number;
  recurring: boolean;
  ride_days?: string[];
  waypoints?: {
    address: string;
    latitude: number;
    longitude: number;
  }[];
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
  origin_address: string;
  destination_address: string;
  created_at: any;
  ride_datetime: string;
  driver_id?: string;
  status: string;
  available_seats: number;
  origin_latitude: number;
  origin_longitude: number;
  recurring: boolean;
  ride_days?: string[];
  waypoints?: {
    address: string;
    latitude: number;
    longitude: number;
  }[];
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
const MAX_RIDES = 6; // Increased for grid layout
const MAX_DISTANCE_KM = 20;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const VALID_RECURRING_STATUSES = ['available', 'full', 'in-progress', 'completed', 'on-hold'];
const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.85; // Card takes 85% of screen width

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const DAY_TRANSLATIONS: { [key in typeof DAYS[number]]: string } = {
  'Sunday': 'الأحد',
  'Monday': 'الإثنين',
  'Tuesday': 'الثلاثاء',
  'Wednesday': 'الأربعاء',
  'Thursday': 'الخميس',
  'Friday': 'الجمعة',
  'Saturday': 'السبت'
};

// Reuse the same utility functions from SuggestedRides
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const cacheSuggestedRides = async (userId: string, rides: Ride[]) => {
  try {
    await AsyncStorage.setItem(`suggested_rides_grid_${userId}`, JSON.stringify({ rides, timestamp: Date.now() }));
  } catch (err) {
    console.error('Error caching suggested rides:', err);
  }
};

const getCachedSuggestedRides = async (userId: string): Promise<Ride[] | null> => {
  try {
    const cacheData = await AsyncStorage.getItem(`suggested_rides_grid_${userId}`);
    if (!cacheData) return null;
    const parsed = JSON.parse(cacheData);
    if (parsed.rides && Date.now() - parsed.timestamp < CACHE_DURATION) {
      return parsed.rides;
    }
    return null;
  } catch (err) {
    console.error('Error retrieving cached suggested rides:', err);
    return null;
  }
};

const clearCache = async (userId: string) => {
  try {
    await AsyncStorage.removeItem(`suggested_rides_grid_${userId}`);
  } catch (err) {
    console.error('Error clearing cache:', err);
  }
};

const SuggestedRidesGrid = ({ refreshKey }: { refreshKey?: number }) => {
  const { language, t } = useLanguage();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [preferredLocations, setPreferredLocations] = useState<RecentRoute[]>([]);
  const { user } = useUser();
  const hasFetchedRef = useRef(false);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch user location
  const fetchUserLocation = useCallback(async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return null;
      }
      let location = await Location.getCurrentPositionAsync({});
      return { latitude: location.coords.latitude, longitude: location.coords.longitude };
    } catch (err) {
      console.error('Error fetching user location:', err);
      return null;
    }
  }, []);

  // Fetch past rides
  const fetchPastRides = useCallback(async () => {
    if (!user?.id) return [];
    try {
      const now = new Date();
      const ridesRef = collection(db, 'rides');
      const rideRequestsRef = collection(db, 'ride_requests');

      const driverRidesQuery = query(
        ridesRef,
        where('driver_id', '==', user.id),
        where('ride_datetime', '<=', now.toISOString()),
        orderBy('ride_datetime', 'desc'),
        limit(20)
      );

      const passengerRequestsQuery = query(
        rideRequestsRef,
        where('user_id', '==', user.id),
        where('status', 'in', ['accepted', 'checked_in', 'checked_out']),
        limit(20)
      );

      const [driverRidesSnapshot, passengerRequestsSnapshot] = await Promise.all([
        getDocs(driverRidesQuery),
        getDocs(passengerRequestsQuery)
      ]);

      const driverRides = driverRidesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RideData));

      const passengerRideIds = passengerRequestsSnapshot.docs.map(doc => doc.data().ride_id).filter(id => id);
      const uniqueRideIds = [...new Set(passengerRideIds)];
      const passengerRidesPromises = uniqueRideIds.map(async (rideId) => {
        const rideDoc = await getDoc(doc(db, 'rides', rideId));
        if (rideDoc.exists()) {
          return { id: rideId, ...rideDoc.data() } as RideData;
        }
        return null;
      });
      const passengerRides = (await Promise.all(passengerRidesPromises)).filter((ride): ride is RideData => ride !== null);

      return [...driverRides, ...passengerRides];
    } catch (err) {
      console.error('Error fetching past rides:', err);
      return [];
    }
  }, [user?.id]);

  // Analyze preferred locations
  const getPreferredLocations = useCallback((pastRides: RideData[]): RecentRoute[] => {
    const locations: { [key: string]: RecentRoute } = {};
    pastRides.forEach(ride => {
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
  }, []);

  // Get rides with driver data
  const getRidesWithDriverData = async (rides: RideData[]): Promise<Ride[]> => {
    const driverIds = new Set(rides
      .map(ride => ride.driver_id)
      .filter((id): id is string => id !== undefined && id !== null)
    );

    const driverDataMap: { [key: string]: UserData } = {};
    for (const driverId of driverIds) {
      try {
        const driverDoc = await getDoc(doc(db, 'users', driverId));
        if (driverDoc.exists()) {
          driverDataMap[driverId] = driverDoc.data() as UserData;
        }
      } catch (err) {
        console.error(`Error fetching driver ${driverId}:`, err);
      }
    }

    return rides.map(ride => {
      const driverId = ride.driver_id;
      const driverData = driverId ? driverDataMap[driverId] : undefined;

      return {
        id: ride.id,
        origin_address: ride.origin_address || 'Unknown Origin',
        destination_address: ride.destination_address || 'Unknown Destination',
        created_at: ride.created_at,
        ride_datetime: ride.ride_datetime || 'Unknown Time',
        status: ride.status || 'unknown',
        available_seats: ride.available_seats ?? 0,
        origin_latitude: ride.origin_latitude || 0,
        origin_longitude: ride.origin_longitude || 0,
        recurring: ride.recurring || false,
        ride_days: ride.ride_days || [],
        waypoints: ride.waypoints || [],
        driver_id: driverId,
        driver: {
          name: driverData?.name || DEFAULT_DRIVER_NAME,
          car_seats: driverData?.driver?.car_seats || DEFAULT_CAR_SEATS,
          profile_image_url: driverData?.driver?.profile_image_url || '',
          car_type: driverData?.driver?.car_type || DEFAULT_CAR_TYPE,
        }
      };
    });
  };

  // Fetch rides
  const fetchRides = useCallback(async () => {
    if (!user?.id) {
      setError(language === 'ar' ? 'المستخدم غير مصادق' : 'User not authenticated');
      setLoading(false);
      return;
    }

    if (!isMountedRef.current) {
      console.log('Fetch aborted: component unmounted');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Check cache
      if (!hasFetchedRef.current) {
        const cachedRides = await getCachedSuggestedRides(user.id);
        if (cachedRides?.length && isMountedRef.current) {
          setRides(cachedRides.slice(0, MAX_RIDES));
          setLoading(false);
          hasFetchedRef.current = true;
          return;
        }
        await clearCache(user.id);
      }

      // Fetch user location
      if (!userLocation && isMountedRef.current) {
        const loc = await fetchUserLocation();
        if (isMountedRef.current) {
          setUserLocation(loc);
        }
      }

      // Fetch preferred locations
      if (preferredLocations.length === 0 && isMountedRef.current) {
        const pastRides = await fetchPastRides();
        if (isMountedRef.current) {
          const prefs = getPreferredLocations(pastRides);
          setPreferredLocations(prefs);
        }
      }

      // Fetch rides
      const ridesRef = collection(db, 'rides');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Future rides query
      const futureRidesQuery = query(
        ridesRef,
        where('ride_datetime', '>=', today.toISOString()),
        where('status', '==', 'available'),
        orderBy('ride_datetime', 'asc'),
        limit(10)
      );

      const futureRidesSnapshot = await getDocs(futureRidesQuery);
      let ridesData = futureRidesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RideData));

      // Recurring rides query
      const recurringQuery = query(
        ridesRef,
        where('recurring', '==', true),
        where('status', 'in', VALID_RECURRING_STATUSES),
        limit(10)
      );
      const recurringSnapshot = await getDocs(recurringQuery);
      const recurringRidesData = recurringSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RideData));

      ridesData = [
        ...ridesData,
        ...recurringRidesData
      ].filter((ride, index, self) => 
        index === self.findIndex(r => r.id === ride.id)
      );

      // Fallback query
      if (ridesData.length === 0 && isMountedRef.current) {
        const fallbackQuery = query(
          ridesRef,
          where('status', '==', 'available'),
          limit(10)
        );
        const fallbackSnapshot = await getDocs(fallbackQuery);
        ridesData = fallbackSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RideData));
      }

      if (ridesData.length === 0) {
        setError(language === 'ar' ? 'لا توجد رحلات متاحة' : 'No rides available');
        setRides([]);
        return;
      }

      const ridesWithDriverData = await getRidesWithDriverData(ridesData);

      // Prioritize rides
      const suggestedRides = ridesWithDriverData
        .map((ride: Ride) => {
          const distance = userLocation ? calculateDistance(
            userLocation.latitude,
            userLocation.longitude,
            ride.origin_latitude,
            ride.origin_longitude
          ) : undefined;

          let priority = 0;
          const routeMatch = preferredLocations.find(
            loc => loc.origin === ride.origin_address && loc.destination === ride.destination_address
          );
          if (routeMatch) {
            priority += routeMatch.count * 100;
          }
          if (ride.recurring) {
            priority += 50;
          }
          if (distance !== undefined) {
            if (distance <= MAX_DISTANCE_KM) {
              priority += (MAX_DISTANCE_KM - distance) * 10;
            } else {
              priority -= distance;
            }
          }

          return { ...ride, distance, priority };
        })
        .sort((a: Ride & { priority?: number }, b: Ride & { priority?: number }) => (b.priority || 0) - (a.priority || 0));

      // Select top rides
      let finalRides = suggestedRides.slice(0, MAX_RIDES);

      if (isMountedRef.current) {
        setRides(finalRides);
        if (finalRides.length) {
          await cacheSuggestedRides(user.id, finalRides);
        }
      }
    } catch (err) {
      console.error('Error fetching rides:', err);
      if (isMountedRef.current) {
        setError(language === 'ar' ? 'فشل في تحميل الرحلات' : 'Failed to load rides');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        hasFetchedRef.current = true;
      }
    }
  }, [user?.id, userLocation, preferredLocations, language, fetchUserLocation, fetchPastRides, getPreferredLocations]);

  // Fetch rides on mount and when refreshKey changes
  useEffect(() => {
    if ((!hasFetchedRef.current || refreshKey !== undefined) && isMountedRef.current) {
      hasFetchedRef.current = false;
      fetchRides();
    }
  }, [fetchRides, refreshKey]);

  const formatDate = (dateStr: string): string => {
    try {
      if (!dateStr) return 'Unknown Date';
      
      // Parse DD/MM/YYYY format
      const [datePart, timePart] = dateStr.split(' ');
      const [dayStr, monthStr, yearStr] = datePart.split('/');
      
      // Create date in YYYY-MM-DD format
      const date = new Date(`${yearStr}-${monthStr}-${dayStr} ${timePart || ''}`);
      
      if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateStr);
        return 'Invalid Date';
      }

      const formattedYear = date.getFullYear();
      const formattedMonth = (date.getMonth() + 1).toString().padStart(2, '0');
      const formattedDay = date.getDate().toString().padStart(2, '0');

      return `${formattedDay}/${formattedMonth}/${formattedYear}`;
    } catch (error) {
      console.error('Error formatting date:', error, 'Date string:', dateStr);
      return 'Unknown Date';
    }
  };

  const formatTimeTo12Hour = (timeStr: string): string => {
    try {
      if (!timeStr) return 'Unknown Time';
      
      // Extract time from the full datetime string if needed
      const timePart = timeStr.includes(' ') ? timeStr.split(' ')[1] : timeStr;
      
      let hours: number;
      let minutes: number;
      
      if (timePart.includes(':')) {
        const [h, m] = timePart.split(':');
        hours = parseInt(h);
        minutes = parseInt(m);
      } else {
        hours = parseInt(timePart);
        minutes = 0;
      }

      if (isNaN(hours) || isNaN(minutes)) {
        console.error('Invalid time values:', { hours, minutes, timeStr });
        return 'Invalid Time';
      }

      const period = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = hours % 12 || 12;
      return `${formattedHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    } catch (error) {
      console.error('Error formatting time:', error, 'Time string:', timeStr);
      return 'Unknown Time';
    }
  };

  const getDayOfWeek = (dateStr: string, lang: string): string => {
    try {
      if (!dateStr) return 'Unknown Day';
      
      // Parse DD/MM/YYYY format
      const [datePart, timePart] = dateStr.split(' ');
      const [dayStr, monthStr, yearStr] = datePart.split('/');
      
      // Create date in YYYY-MM-DD format
      const date = new Date(`${yearStr}-${monthStr}-${dayStr} ${timePart || ''}`);
      
      if (isNaN(date.getTime())) {
        console.error('Invalid date for day of week:', dateStr);
        return 'Unknown Day';
      }
      
      const dayIndex = date.getDay();
      const dayName = DAYS[dayIndex];
      return lang === 'ar' ? DAY_TRANSLATIONS[dayName as keyof typeof DAY_TRANSLATIONS] : dayName;
    } catch (error) {
      console.error('Error getting day of week:', error);
      return 'Unknown Day';
    }
  };

  const renderRideCard = ({ item }: { item: Ride }) => {
    console.log('Ride datetime:', item.ride_datetime);
    
    const formattedDate = formatDate(item.ride_datetime);
    const formattedTime = formatTimeTo12Hour(item.ride_datetime);
    const dayOfWeek = getDayOfWeek(item.ride_datetime, language);

    console.log('Formatted values:', {
      date: formattedDate,
      time: formattedTime,
      day: dayOfWeek
    });

    return (
      <TouchableOpacity
        onPress={() => router.push(`/ride-details/${item.id}`)}
        style={[styles.card, Platform.OS === 'android' ? styles.androidShadow : styles.iosShadow]}
      >
        <View style={styles.cardContent}>
          <View style={styles.mainInfo}>
            <View style={styles.locationContainer}>
              <View style={styles.locationRow}>
                <View style={styles.locationDot} />
                <Text style={styles.locationText} numberOfLines={1}>
                  {item.origin_address}
                </Text>
              </View>
              <View style={styles.locationRow}>
                <View style={[styles.locationDot, styles.locationDotEnd]} />
                <Text style={styles.locationText} numberOfLines={1}>
                  {item.destination_address}
                </Text>
              </View>
            </View>

            <View style={styles.driverSection}>
              <Image 
                source={item.driver?.profile_image_url ? { uri: item.driver.profile_image_url } : icons.profile} 
                style={styles.driverImage}
              />
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{item.driver?.name || DEFAULT_DRIVER_NAME}</Text>
                <Text style={styles.carInfo}>
                  {item.driver?.car_type || DEFAULT_CAR_TYPE} • {item.available_seats} {language === 'ar' ? 'مقاعد' : 'seats'}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.rightSection}>
            <View style={styles.timeContainer}>
              <Text style={styles.dayText}>{dayOfWeek}</Text>
              <Text style={styles.dateText}>{formattedDate}</Text>
              <Text style={styles.timeText}>{formattedTime}</Text>
            </View>
            <View style={[styles.statusContainer, { backgroundColor: item.recurring ? '#e0f2fe' : '#dcfce7' }]}>
              <Text style={[styles.statusText, { color: item.recurring ? '#0284c7' : '#16a34a' }]}>
                {item.recurring ? (language === 'ar' ? 'متكرر' : 'Recurring') : (language === 'ar' ? 'متاح' : 'Available')}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => { hasFetchedRef.current = false; fetchRides(); }} style={styles.retryButton}>
          <Text style={styles.retryText}>{language === 'ar' ? 'إعادة المحاولة' : t.retry}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {rides.length > 0 ? (
        <ScrollView 
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gridContainer}
          decelerationRate="fast"
          snapToInterval={CARD_WIDTH + 16} // Card width + margin
          snapToAlignment="center"
        >
          {rides.map((ride) => (
            <View key={ride.id} style={styles.cardContainer}>
              {renderRideCard({ item: ride })}
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.centerContainer}>
          <Image source={images.noResult} style={styles.noResultImage} resizeMode="contain" />
          <Text style={styles.noRidesText}>
            {language === 'ar' ? 'لا توجد رحلات متاحة حاليًا' : t.noRidesAvailable}
          </Text>
          <TouchableOpacity onPress={() => { hasFetchedRef.current = false; fetchRides(); }} style={styles.retryButton}>
            <Text style={styles.retryText}>{language === 'ar' ? 'إعادة المحاولة' : t.retry}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gridContainer: {
    paddingHorizontal: 16,
  },
  cardContainer: {
    width: CARD_WIDTH,
    marginRight: 16,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    height: 200,
  },
  androidShadow: {
    elevation: 4,
  },
  iosShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardContent: {
    padding: 16,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mainInfo: {
    flex: 1,
    marginRight: 16,
  },
  locationContainer: {
    marginBottom: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    height: 24,
  },
  locationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
    marginRight: 8,
  },
  locationDotEnd: {
    backgroundColor: '#ef4444',
  },
  locationText: {
    flex: 1,
    fontSize: 15,
    color: '#1f2937',
    fontWeight: '500',
  },
  driverSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  carInfo: {
    fontSize: 13,
    color: '#6b7280',
  },
  rightSection: {
    width: 120,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  timeContainer: {
    alignItems: 'flex-end',
  },
  dayText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
    textAlign: 'right',
  },
  dateText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 2,
    textAlign: 'right',
  },
  timeText: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
    textAlign: 'right',
  },
  statusContainer: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  errorText: {
    color: '#ef4444',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 14,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  retryText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },
  noResultImage: {
    width: 160,
    height: 160,
    marginBottom: 16,
  },
  noRidesText: {
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
    fontSize: 14,
  },
});

export default SuggestedRidesGrid; 