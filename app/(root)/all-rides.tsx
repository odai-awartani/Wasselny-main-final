import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Platform, Image, TextInput, ScrollView, Modal, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { collection, query, getDocs, where, orderBy, limit, getDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@/context/LanguageContext';
import { StyleSheet } from 'react-native';
import { icons } from '@/constants';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Driver {
  name: string;
  car_type: string;
  car_seats: number;
  profile_image_url?: string;
  car_image_url?: string;
}

interface Ride {
  id: string;
  origin_address: string;
  destination_address: string;
  ride_datetime: string;
  status: string;
  available_seats: number;
  recurring: boolean;
  driver_id: string;
  driver?: Driver;
}

const FILTERS = {
  ALL: 'all',
  TODAY: 'today',
  TOMORROW: 'tomorrow',
  DAY_AFTER_TOMORROW: 'day_after_tomorrow',
  DAY_3: 'day_3',
  DAY_4: 'day_4',
  DAY_5: 'day_5'
};

const SORT_OPTIONS = {
  TIME_ASC: 'time_asc',
  TIME_DESC: 'time_desc',
  SEATS_ASC: 'seats_asc',
  SEATS_DESC: 'seats_desc'
};

const RideSkeleton = () => {
  const animatedValue = new Animated.Value(0);
  const { language } = useLanguage();

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const opacity = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <Animated.View 
      className="bg-white p-4 rounded-2xl mb-3"
      style={[
        Platform.OS === 'android' ? styles.androidShadow : styles.iosShadow,
        { opacity }
      ]}
    >
      {/* Status badge */}
      <View className={`absolute top-4 ${language === 'ar' ? 'left-4' : 'right-4'}`}>
        <View className="px-2 py-1 rounded-full bg-gray-100">
          <View className="h-4 w-16 bg-gray-200 rounded-full" />
        </View>
      </View>

      {/* Driver info skeleton */}
      <View className={`flex-row items-center mb-3 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
        <View className={`w-10 h-10 rounded-full bg-gray-200 ${language === 'ar' ? 'ml-3' : 'mr-3'}`} />
        <View className={language === 'ar' ? 'items-end' : 'items-start'}>
          <View className="h-5 bg-gray-200 rounded-full w-32 mb-2" />
          <View className="h-4 bg-gray-200 rounded-full w-24" />
        </View>
      </View>

      {/* Route info skeleton */}
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

      {/* Time and seats skeleton */}
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

const AllRides = () => {
  const router = useRouter();
  const { language } = useLanguage();
  const [rides, setRides] = useState<Ride[]>([]);
  const [filteredRides, setFilteredRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState(FILTERS.ALL);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState(SORT_OPTIONS.TIME_ASC);
  const [showSortModal, setShowSortModal] = useState(false);

  const fetchRides = (filter: string) => {
    try {
      setLoading(true);
      setError(null);

      const ridesRef = collection(db, 'rides');
      const now = new Date();
      
      // Helper function to format date as DD/MM/YYYY HH:mm
      const formatDateForQuery = (date: Date) => {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
      };

      // Helper function to parse date from DD/MM/YYYY HH:mm format
      const parseDateFromString = (dateStr: string) => {
        const [datePart, timePart] = dateStr.split(' ');
        const [day, month, year] = datePart.split('/');
        const [hours, minutes] = timePart.split(':');
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
      };

      // Helper function to get start of day
      const getStartOfDay = (date: Date) => {
        const newDate = new Date(date);
        newDate.setHours(0, 0, 0, 0);
        return newDate;
      };

      // Helper function to get end of day
      const getEndOfDay = (date: Date) => {
        const newDate = new Date(date);
        newDate.setHours(23, 59, 59, 999);
        return newDate;
      };
      
      let ridesQuery;
      
      switch (filter) {
        case FILTERS.TODAY:
          const todayStart = getStartOfDay(now);
          const todayEnd = getEndOfDay(now);
          ridesQuery = query(
            ridesRef,
            where('ride_datetime', '>=', formatDateForQuery(todayStart)),
            where('ride_datetime', '<=', formatDateForQuery(todayEnd)),
            where('status', '==', 'available'),
            orderBy('ride_datetime', 'asc')
          );
          break;
          
        case FILTERS.TOMORROW:
          const tomorrowStart = getStartOfDay(new Date(now.getTime() + 24 * 60 * 60 * 1000));
          const tomorrowEnd = getEndOfDay(new Date(now.getTime() + 24 * 60 * 60 * 1000));
          ridesQuery = query(
            ridesRef,
            where('ride_datetime', '>=', formatDateForQuery(tomorrowStart)),
            where('ride_datetime', '<=', formatDateForQuery(tomorrowEnd)),
            where('status', '==', 'available'),
            orderBy('ride_datetime', 'asc')
          );
          break;

        case FILTERS.DAY_AFTER_TOMORROW:
          const dayAfterTomorrowStart = getStartOfDay(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000));
          const dayAfterTomorrowEnd = getEndOfDay(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000));
          ridesQuery = query(
            ridesRef,
            where('ride_datetime', '>=', formatDateForQuery(dayAfterTomorrowStart)),
            where('ride_datetime', '<=', formatDateForQuery(dayAfterTomorrowEnd)),
            where('status', '==', 'available'),
            orderBy('ride_datetime', 'asc')
          );
          break;

        case FILTERS.DAY_3:
          const day3Start = getStartOfDay(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000));
          const day3End = getEndOfDay(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000));
          ridesQuery = query(
            ridesRef,
            where('ride_datetime', '>=', formatDateForQuery(day3Start)),
            where('ride_datetime', '<=', formatDateForQuery(day3End)),
            where('status', '==', 'available'),
            orderBy('ride_datetime', 'asc')
          );
          break;

        case FILTERS.DAY_4:
          const day4Start = getStartOfDay(new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000));
          const day4End = getEndOfDay(new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000));
          ridesQuery = query(
            ridesRef,
            where('ride_datetime', '>=', formatDateForQuery(day4Start)),
            where('ride_datetime', '<=', formatDateForQuery(day4End)),
            where('status', '==', 'available'),
            orderBy('ride_datetime', 'asc')
          );
          break;

        case FILTERS.DAY_5:
          const day5Start = getStartOfDay(new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000));
          const day5End = getEndOfDay(new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000));
          ridesQuery = query(
            ridesRef,
            where('ride_datetime', '>=', formatDateForQuery(day5Start)),
            where('ride_datetime', '<=', formatDateForQuery(day5End)),
            where('status', '==', 'available'),
            orderBy('ride_datetime', 'asc')
          );
          break;
        
        default: // FILTERS.ALL
          // For ALL rides, we'll filter out past rides in the snapshot handler
          ridesQuery = query(
            ridesRef,
            orderBy('ride_datetime', 'asc')
          );
          break;
      }

      console.log('Setting up listener for rides with filter:', filter);

      // Set up real-time listener
      const unsubscribe = onSnapshot(ridesQuery, async (snapshot) => {
        console.log('Received snapshot update with', snapshot.docs.length, 'rides');
        
        const ridesData = snapshot.docs.map(doc => {
          const data = doc.data();
          return { id: doc.id, ...data } as Ride;
        });

        // Filter out past rides for ALL filter
        const filteredRidesData = filter === FILTERS.ALL 
          ? ridesData.filter(ride => {
              const rideDate = parseDateFromString(ride.ride_datetime);
              return rideDate > now;
            })
          : ridesData;

      // Fetch driver information for each ride
      const ridesWithDriverInfo = await Promise.all(
          filteredRidesData.map(async (ride) => {
          if (ride.driver_id) {
            try {
              const driverDoc = await getDoc(doc(db, 'users', ride.driver_id));
              if (driverDoc.exists()) {
                const driverData = driverDoc.data();
                ride.driver = {
                  name: driverData.name || 'Unknown Driver',
                  car_type: driverData.driver?.car_type || 'Unknown Car Type',
                  car_seats: driverData.driver?.car_seats || 4,
                  profile_image_url: driverData.driver?.profile_image_url,
                  car_image_url: driverData.driver?.car_image_url
                };
              }
            } catch (err) {
              console.error(`Error fetching driver ${ride.driver_id}:`, err);
            }
          }
          return ride;
        })
      );

        console.log('Setting rides with driver info:', ridesWithDriverInfo);
      setRides(ridesWithDriverInfo);
      setFilteredRides(ridesWithDriverInfo);
        setLoading(false);
      }, (err) => {
        console.error('Error in rides listener:', err);
        setError(language === 'ar' ? 'فشل في تحميل الرحلات' : 'Failed to load rides');
        setLoading(false);
      });

      return () => {
        console.log('Cleaning up rides listener');
        unsubscribe();
      };
    } catch (err) {
      console.error('Error setting up rides listener:', err);
      setError(language === 'ar' ? 'فشل في تحميل الرحلات' : 'Failed to load rides');
      setLoading(false);
      return () => {};
    }
  };

  // Add a debug effect to log state changes
  useEffect(() => {
    console.log('Rides state updated:', rides.length);
  }, [rides]);

  useEffect(() => {
    console.log('Filtered rides updated:', filteredRides.length);
  }, [filteredRides]);

  useEffect(() => {
    const cleanup = fetchRides(activeFilter);
    return cleanup;
  }, [activeFilter]);

  useEffect(() => {
    let filtered = [...rides];
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(ride => 
        ride.origin_address.toLowerCase().includes(query) ||
        ride.destination_address.toLowerCase().includes(query) ||
        ride.driver?.name.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    switch (sortBy) {
      case SORT_OPTIONS.TIME_ASC:
        filtered.sort((a, b) => new Date(a.ride_datetime).getTime() - new Date(b.ride_datetime).getTime());
        break;
      case SORT_OPTIONS.TIME_DESC:
        filtered.sort((a, b) => new Date(b.ride_datetime).getTime() - new Date(a.ride_datetime).getTime());
        break;
      case SORT_OPTIONS.SEATS_ASC:
        filtered.sort((a, b) => a.available_seats - b.available_seats);
        break;
      case SORT_OPTIONS.SEATS_DESC:
        filtered.sort((a, b) => b.available_seats - a.available_seats);
        break;
    }

    setFilteredRides(filtered);
  }, [rides, searchQuery, sortBy]);

  const renderFilterButton = (filter: string, label: string) => (
    <TouchableOpacity
      onPress={() => setActiveFilter(filter)}
      className={`px-4 py-2 rounded-full mx-1 ${
        activeFilter === filter ? 'bg-orange-500' : 'bg-gray-200'
      }`}
    >
      <Text
        className={`font-CairoMedium text-sm ${
          activeFilter === filter ? 'text-white' : 'text-gray-700'
        }`}
        style={{ textAlign: language === 'ar' ? 'right' : 'left' }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderSortButton = (option: string, label: string) => (
    <TouchableOpacity
      onPress={() => {
        setSortBy(option);
        setShowSortModal(false);
      }}
      className={`w-full px-4 py-3.5 rounded-xl mb-2 flex-row items-center ${
        sortBy === option ? 'bg-orange-50' : 'bg-gray-50'
      }`}
    >
      <View className={`flex-1 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
      <Text
          className={`font-CairoMedium text-base ${
            sortBy === option ? 'text-orange-500' : 'text-gray-700'
        }`}
      >
        {label}
      </Text>
      </View>
      {sortBy === option && (
        <Ionicons name="checkmark-circle" size={24} color="#F8780D" />
      )}
    </TouchableOpacity>
  );

  const renderRideCard = ({ item }: { item: Ride }) => {
    const [date, time] = item.ride_datetime.split(' ') || ['Unknown Date', 'Unknown Time'];
    const formattedTime = time.includes(':') ? formatTimeTo12Hour(time) : time;
    const dayOfWeek = getDayOfWeek(item.ride_datetime, language);
    
    // Get status color and text
    const getStatusInfo = (status: string, recurring: boolean) => {
      if (recurring) {
        return {
          bgColor: 'bg-orange-50',
          textColor: 'text-orange-400',
          text: language === 'ar' ? 'متكرر' : 'Recurring'
        };
      }
      
      switch (status.toLowerCase()) {
        case 'available':
          return {
            bgColor: 'bg-green-50',
            textColor: 'text-green-600',
            text: language === 'ar' ? 'متاح' : 'Available'
          };
        case 'in_progress':
          return {
            bgColor: 'bg-blue-50',
            textColor: 'text-blue-600',
            text: language === 'ar' ? 'قيد التنفيذ' : 'In Progress'
          };
        case 'completed':
          return {
            bgColor: 'bg-gray-50',
            textColor: 'text-gray-600',
            text: language === 'ar' ? 'مكتمل' : 'Completed'
          };
        case 'cancelled':
          return {
            bgColor: 'bg-red-50',
            textColor: 'text-red-600',
            text: language === 'ar' ? 'ملغي' : 'Cancelled'
          };
        case 'full':
          return {
            bgColor: 'bg-red-50',
            textColor: 'text-red-600',
            text: language === 'ar' ? 'ممتلئ' : 'Full'
          };
        default:
          return {
            bgColor: 'bg-gray-50',
            textColor: 'text-gray-600',
            text: language === 'ar' ? 'غير معروف' : 'Unknown'
          };
      }
    };

    const statusInfo = getStatusInfo(item.status, item.recurring);
    
    return (
      <TouchableOpacity
        onPress={() => router.push(`/ride-details/${item.id}`)}
        className="bg-white p-4 rounded-2xl mb-3"
        style={Platform.OS === 'android' ? styles.androidShadow : styles.iosShadow}
      >
        <View className={`absolute top-4 ${language === 'ar' ? 'left-4' : 'right-4'}`}>
          <View className={`px-2 pt-2 pb-1 rounded-full ${statusInfo.bgColor}`}>
            <Text className={`text-xs font-CairoMedium ${statusInfo.textColor}`}>
              {statusInfo.text}
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
              {item.driver?.name || 'Unknown Driver'}
            </Text>
            <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {item.driver?.car_type || 'Unknown Car Type'}
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
              <Text className={`text-base font-CairoMedium flex-1 ${language === 'ar' ? 'text-right' : 'text-left'}`} numberOfLines={1}>
                {item.origin_address}
              </Text>
            </View>
            <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <Image source={icons.target} className={`w-5 h-5 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
              <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'font-CairoBold ml-2' : 'mr-2'}`}>
                {language === 'ar' ? 'إلى' : 'To'}:
              </Text>
              <Text className={`text-base font-CairoMedium flex-1 ${language === 'ar' ? 'text-right' : 'text-left'}`} numberOfLines={1}>
                {item.destination_address}
              </Text>
            </View>
          </View>
        </View>

        <View className={`flex-row justify-between items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <Image source={icons.calendar} className={`w-4 h-4 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
            <View>
              <Text className={`text-sm pt-5 text-gray-600 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {dayOfWeek}
              </Text>
              <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
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
              {item.available_seats} {language === 'ar' ? 'مقاعد' : 'seats'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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

  const getDayOfWeek = (dateStr: string, lang: string): string => {
    try {
      if (!dateStr) return 'Unknown Day';
      
      const [datePart, timePart] = dateStr.split(' ');
      const [dayStr, monthStr, yearStr] = datePart.split('/');
      
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

  const getFormattedDate = (daysFromNow: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toLocaleDateString('en-US', { 
      month: 'numeric', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const renderSkeletonList = () => (
    <View className="flex-1 px-4">
      {[...Array(5)].map((_, index) => (
        <RideSkeleton key={index} />
      ))}
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="bg-white p-4">
        <View className={`flex-row justify-between items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <TouchableOpacity 
            onPress={() => router.back()} 
            className={`flex-row items-center bg-gray-100 px-2 py-2 rounded-full ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1,
              shadowRadius: 2,
              elevation: 2,
            }}
          >
            <Ionicons 
              name={language === 'ar' ? 'chevron-forward' : 'chevron-back'} 
              size={20} 
              color="#F8780D"
            />
          </TouchableOpacity>
          <Text className={`text-xl font-CairoBold ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'جميع الرحلات' : 'All Rides'}
          </Text>
          <TouchableOpacity 
            onPress={() => setShowSortModal(true)}
            className="p-2 bg-gray-100 rounded-full"
          >
            <Ionicons name="options-outline" size={20} color="#F8780D" />
          </TouchableOpacity>
        </View>

        <View className="mb-4">
          <View className="flex-row items-center bg-gray-100 px-4 py-1 rounded-full">
            <Ionicons name="search" size={20} color="#6B7280" />
            <TextInput
              placeholder={language === 'ar' ? 'ابحث عن رحلة...' : 'Search rides...'}
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 font-CairoMedium ml-2"
              style={{ textAlign: language === 'ar' ? 'right' : 'left' }}
            />
          </View>
        </View>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          className="mb-0"
        >
          <View className="flex-row">
            {renderFilterButton(FILTERS.ALL, language === 'ar' ? 'الكل' : 'All')}
            {renderFilterButton(FILTERS.TODAY, language === 'ar' ? 'اليوم' : 'Today')}
            {renderFilterButton(FILTERS.TOMORROW, language === 'ar' ? 'غداً' : 'Tomorrow')}
            {renderFilterButton(FILTERS.DAY_AFTER_TOMORROW, getFormattedDate(2))}
            {renderFilterButton(FILTERS.DAY_3, getFormattedDate(3))}
            {renderFilterButton(FILTERS.DAY_4, getFormattedDate(4))}
            {renderFilterButton(FILTERS.DAY_5, getFormattedDate(5))}
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={showSortModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSortModal(false)}
      >
        <TouchableOpacity 
          className="flex-1 bg-black/50"
          activeOpacity={1}
          onPress={() => setShowSortModal(false)}
        >
          <View className="flex-1 justify-end">
            <View className="bg-white rounded-t-3xl">
              {/* Handle bar */}
              <View className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mt-3 mb-2" />
              
              {/* Header */}
              <View className="px-6 pb-4 border-b border-gray-100">
                <View className={`flex-row justify-between items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <Text className={`text-xl font-CairoBold ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {language === 'ar' ? 'ترتيب حسب' : 'Sort by'}
            </Text>
                  <TouchableOpacity 
                    onPress={() => setShowSortModal(false)}
                    className="p-2 rounded-full bg-gray-50"
                  >
                    <Ionicons name="close" size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sort options */}
              <View className="p-6">
                <View className="space-y-2">
              {renderSortButton(SORT_OPTIONS.TIME_ASC, language === 'ar' ? 'الوقت (أقدم)' : 'Time (Oldest)')}
              {renderSortButton(SORT_OPTIONS.TIME_DESC, language === 'ar' ? 'الوقت (أحدث)' : 'Time (Newest)')}
              {renderSortButton(SORT_OPTIONS.SEATS_ASC, language === 'ar' ? 'المقاعد (أقل)' : 'Seats (Least)')}
              {renderSortButton(SORT_OPTIONS.SEATS_DESC, language === 'ar' ? 'المقاعد (أكثر)' : 'Seats (Most)')}
            </View>
          </View>

              {/* Bottom safe area */}
              <View className="h-6" />
            </View>
      </View>
        </TouchableOpacity>
      </Modal>

      {loading ? (
        renderSkeletonList()
      ) : error ? (
        <View className="flex-1 items-center justify-center p-4">
          <Text className={`text-red-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>{error}</Text>
          <TouchableOpacity 
            onPress={() => fetchRides(activeFilter)} 
            className="mt-4 bg-orange-500 px-4 py-2 rounded-full"
          >
            <Text className="text-white font-CairoMedium">
              {language === 'ar' ? 'إعادة المحاولة' : 'Retry'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : filteredRides.length === 0 ? (
        <View className="flex-1 items-center justify-center p-4">
          <Ionicons name="search-outline" size={64} color="#9CA3AF" />
          <Text className={`text-gray-500 text-center mt-4 font-CairoMedium ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'لا توجد رحلات متاحة' : 'No rides available'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRides}
          renderItem={renderRideCard}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </SafeAreaView>
  );
};

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
});

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

export default AllRides; 