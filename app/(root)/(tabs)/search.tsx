import { StyleSheet, Text, View, TextInput, TouchableOpacity, Image, FlatList, ActivityIndicator, Platform, ScrollView } from 'react-native'
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { collection, query, orderBy, limit, startAfter, doc, getDoc, Query, QuerySnapshot, DocumentData, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { icons } from '@/constants'
import { useLanguage } from '@/context/LanguageContext'
import { useUser } from '@clerk/clerk-expo'
import { haversine } from '@/lib/utils'
import Header from '@/components/Header'
import * as Haptics from 'expo-haptics'
import * as Location from 'expo-location'
import DateTimePicker from '@react-native-community/datetimepicker'
import Modal from 'react-native-modal'
import debounce from 'lodash/debounce'
import Animated, { FadeIn } from 'react-native-reanimated'
import { MaterialIcons } from '@expo/vector-icons'

// Constants
const MAX_DISTANCE_KM = 500
const MIN_DISTANCE_KM = 1
const RIDES_PER_PAGE = 5
const STATUS_OPTIONS = ['all', 'available', 'cancelled', 'in-progress', 'completed', 'full']
const GENDER_OPTIONS = ['any', 'male', 'female']
// const RECURRING_OPTIONS = ['all', 'recurring', 'nonrecurring']

const FILTERS = {
  ALL: 'all',
  TODAY: 'today',
  TOMORROW: 'tomorrow',
  DAY_AFTER_TOMORROW: 'day_after_tomorrow',
  DAY_3: 'day_3',
  DAY_4: 'day_4',
  DAY_5: 'day_5'
};

// Update the GENDER_MAP constant
const GENDER_MAP: { [key: string]: string } = {
  'male': 'male',
  'Male': 'male',
  'ذكر': 'male',
  'MALE': 'male',
  'female': 'female',
  'Female': 'female',
  'أنثى': 'female',
  'FEMALE': 'female',
  'any': 'any',
  'Any': 'any',
  'both': 'any',
  'Both': 'any',
  'كلاهما': 'any',
  'ANY': 'any',
  'BOTH': 'any'
};

interface SearchResult {
  id: string
  type: 'ride' | 'driver'
  name?: string
  origin?: string
  destination?: string
  distance?: number
  profile_image_url?: string
  ride_datetime?: string
  price?: number
  car_type?: string
  rating?: number
  is_recurring?: boolean
  recurring_days?: string[]
  origin_coordinates?: { latitude: number; longitude: number }
  destination_coordinates?: { latitude: number; longitude: number }
  status?: string
  available_seats?: number
  gender_preference?: 'male' | 'female' | 'any'
  waypoints?: Array<{
    address: string
    street: string
    latitude: number
    longitude: number
  }>
}

interface FilterOptions {
  type: 'all' | 'rides' | 'drivers'
  sortBy: 'price' | 'time' | 'rating'
  maxPrice?: number
  minRating?: number
  distance?: number
  status?: string[]
  date?: Date | null
  gender?: string
  // recurring?: 'all' | 'recurring' | 'nonrecurring'
}

// Helper to parse DD/MM/YYYY HH:mm
function parseCustomDate(dateStr: string) {
  if (!dateStr) return new Date('');
  const [datePart, timePart] = dateStr.split(' ');
  if (!datePart || !timePart) return new Date('');
  const [day, month, year] = datePart.split('/').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

// Helper to fetch driver image and name
async function fetchDriverInfo(driverId: string): Promise<{ profile_image_url: string | null; name: string | null; car_type: string | null }> {
  try {
    const userDoc = await getDoc(doc(db, 'users', driverId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return {
        profile_image_url: userData.driver?.profile_image_url || userData.profile_image_url || null,
        name: userData.name || null,
        car_type: userData.driver?.car_type || null
      };
    }
  } catch (err) {
    // Ignore
  }
  return { profile_image_url: null, name: null, car_type: null };
}

// Add type guard for toDate
function hasToDate(obj: any): obj is { toDate: () => Date } {
  return obj && typeof obj === 'object' && typeof obj.toDate === 'function';
}

// Helper function to normalize gender values
const normalizeGender = (gender: string | undefined): string | undefined => {
  if (!gender) return undefined;
  const normalized = GENDER_MAP[gender] || gender.toLowerCase();
  console.log('Normalizing gender:', { original: gender, normalized });
  return normalized;
};

const Search = () => {
  const router = useRouter()
  const params = useLocalSearchParams()
  const { t, language } = useLanguage()
  const { user } = useUser()
  const [searchQuery, setSearchQuery] = useState(params.searchQuery as string || '')
  const [allResults, setAllResults] = useState<SearchResult[]>([])
  const [displayedResults, setDisplayedResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [activeFilter, setActiveFilter] = useState(FILTERS.ALL)
  const [filters, setFilters] = useState<FilterOptions>({
    type: 'all',
    sortBy: 'time',
    maxPrice: undefined,
    minRating: undefined,
    distance: MAX_DISTANCE_KM,
    status: [],
    date: null,
    gender: 'any',
    // recurring: 'all',
  })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null)

  // Fetch user profile image
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user?.id) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.id));
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
  }, [user?.id]);

  // Initialize search with query from home page
  useEffect(() => {
    if (params.searchQuery) {
      setSearchQuery(params.searchQuery as string)
      handleSearch(params.searchQuery as string)
    }
  }, [params.searchQuery])

  // Fetch user location
  const fetchUserLocation = useCallback(async () => {
    try {
      let { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        console.log('Location permission denied')
        return null
      }
      let location = await Location.getCurrentPositionAsync({})
      setUserLocation({ latitude: location.coords.latitude, longitude: location.coords.longitude })
      return { latitude: location.coords.latitude, longitude: location.coords.longitude }
    } catch (err) {
      console.error('Error fetching user location:', err)
      return null
    }
  }, [])

  // Debounced search handler
  const handleSearchInput = useCallback((text: string) => {
    setSearchQuery(text)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      handleSearch(text)
    }, 400)
  }, [])

  // Fetch all rides
  const fetchAllRides = useCallback(async () => {
    setLoading(true)
    try {
      let rides: SearchResult[] = []
      let lastDoc = null
      let keepFetching = true
      while (keepFetching) {
        const ridesRef = collection(db, 'rides')
        const ridesQuery: Query<DocumentData> = lastDoc
          ? query(ridesRef, orderBy('ride_datetime', 'asc'), startAfter(lastDoc), limit(30))
          : query(ridesRef, orderBy('ride_datetime', 'asc'), limit(30))
        const ridesSnapshot: QuerySnapshot<DocumentData> = await getDocs(ridesQuery)
        if (ridesSnapshot.empty) {
          keepFetching = false
          break
        }
        for (const docSnap of ridesSnapshot.docs) {
          const ride = docSnap.data()
          if (!isValidRide(ride)) continue
          let profile_image_url: string | undefined = undefined
          let driverName: string | undefined = undefined
          let carType: string | undefined = undefined
          if (ride.driver_id) {
            const driverInfo = await fetchDriverInfo(ride.driver_id)
            if (driverInfo.profile_image_url) {
              profile_image_url = driverInfo.profile_image_url
            }
            if (driverInfo.name) {
              driverName = driverInfo.name
            }
            if (driverInfo.car_type) {
              carType = driverInfo.car_type
            }
          }
          rides.push({
            id: docSnap.id,
            type: 'ride',
            name: driverName,
            origin: ride.origin_address,
            destination: ride.destination_address,
            ride_datetime: ride.ride_datetime,
            price: ride.price,
            car_type: carType,
            rating: ride.driver_rating,
            is_recurring: ride.is_recurring,
            recurring_days: ride.ride_days,
            distance: ride.origin_latitude && ride.origin_longitude && ride.destination_latitude && ride.destination_longitude
              ? haversine(
                  ride.origin_latitude,
                  ride.origin_longitude,
                  ride.destination_latitude,
                  ride.destination_longitude
                )
              : undefined,
            origin_coordinates: {
              latitude: ride.origin_latitude,
              longitude: ride.origin_longitude
            },
            destination_coordinates: {
              latitude: ride.destination_latitude,
              longitude: ride.destination_longitude
            },
            status: ride.status,
            available_seats: ride.available_seats,
            gender_preference: ride.required_gender,
            profile_image_url,
            waypoints: ride.waypoints
          })
        }
        lastDoc = ridesSnapshot.docs[ridesSnapshot.docs.length - 1]
        if (ridesSnapshot.docs.length < 30) keepFetching = false
      }
      setAllResults(rides)
      setCurrentIndex(RIDES_PER_PAGE)
      setHasMore(rides.length > RIDES_PER_PAGE)
    } catch (error) {
      console.error('Error fetching rides:', error)
      setAllResults([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [])

  // Apply filters to results
  const applyFilters = useCallback((results: SearchResult[]) => {
    let filtered = [...results]

    // Type filter
    if (filters.type !== 'all') {
      filtered = filtered.filter(item => {
        if (filters.type === 'rides') return item.type === 'ride'
        if (filters.type === 'drivers') return item.type === 'driver'
        return true
      })
    }

    // Search query filter
    if (searchQuery.trim()) {
      const searchText = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(item => {
        const originMatch = item.origin?.toLowerCase().includes(searchText) ||
          item.origin?.toLowerCase().includes(searchText.replace('ة', 'ه')) ||
          item.origin?.toLowerCase().includes(searchText.replace('ه', 'ة'))
        const destMatch = item.destination?.toLowerCase().includes(searchText) ||
          item.destination?.toLowerCase().includes(searchText.replace('ة', 'ه')) ||
          item.destination?.toLowerCase().includes(searchText.replace('ه', 'ة'))
        const nameMatch = item.name?.toLowerCase().includes(searchText)
        return originMatch || destMatch || nameMatch
      })
    }

    // Distance filter
    if (filters.distance && filters.distance < MAX_DISTANCE_KM && userLocation) {
      filtered = filtered.filter(item => {
        if (item.origin_coordinates && item.distance) {
          const distanceToOrigin = haversine(
            userLocation.latitude,
            userLocation.longitude,
            item.origin_coordinates.latitude,
            item.origin_coordinates.longitude
          )
          return distanceToOrigin <= filters.distance!
        }
        return true
      })
    }

    // Status filter
    if (filters.status?.length && !filters.status.includes('all')) {
      filtered = filtered.filter(item => {
        if (!item.status) return false
        return filters.status!.includes(item.status)
      })
    }

    // Date filter
    if (filters.date) {
      const filterDay = filters.date.getDate()
      const filterMonth = filters.date.getMonth()
      const filterYear = filters.date.getFullYear()
      
      filtered = filtered.filter(item => {
        if (!item.ride_datetime) return false
        
        let rideDate: Date
        if (typeof item.ride_datetime === 'string') {
          const [datePart, timePart] = item.ride_datetime.split(' ')
          const [day, month, year] = datePart.split('/').map(Number)
          rideDate = new Date(year, month - 1, day)
        } else {
          rideDate = new Date(item.ride_datetime)
        }

        return (
          rideDate.getDate() === filterDay &&
          rideDate.getMonth() === filterMonth &&
          rideDate.getFullYear() === filterYear
        )
      })
    }

    // Gender filter
    if (filters.gender) {
      console.log('=== Gender Filter Debug ===')
      console.log('Selected gender filter:', filters.gender)
      console.log('Total rides before gender filter:', filtered.length)
      
      filtered = filtered.filter(item => {
        const normalizedItemGender = normalizeGender(item.gender_preference)
        const normalizedFilterGender = normalizeGender(filters.gender)
        
        console.log('\nChecking ride:', {
          id: item.id,
          original_gender: item.gender_preference,
          normalized_gender: normalizedItemGender,
          filter_gender: normalizedFilterGender
        })

        // If gender is 'any', show all rides
        if (normalizedFilterGender === 'any') {
          console.log('Filter is "any" - showing all rides')
          return true
        }

        // For specific gender filters (male/female)
        if (normalizedFilterGender === 'male' || normalizedFilterGender === 'female') {
          // Only show rides that exactly match the selected gender
          const matchesGender = normalizedItemGender === normalizedFilterGender

          console.log('Gender filter details:', {
            matchesGender,
            willShow: matchesGender,
            itemGender: normalizedItemGender,
            filterGender: normalizedFilterGender
          })

          // Strict matching - only show exact matches
          return matchesGender
        }

        return true
      })
      
      console.log('Total rides after gender filter:', filtered.length)
      console.log('=== End Gender Filter Debug ===\n')
    }

    // Price filter
    if (filters.maxPrice) {
      filtered = filtered.filter(item => {
        if (!item.price) return true
        return item.price <= filters.maxPrice!
      })
    }

    // Rating filter
    if (filters.minRating) {
      filtered = filtered.filter(item => {
        if (!item.rating) return true
        return item.rating >= filters.minRating!
      })
    }

    // Sort results
    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'price':
          return (a.price || 0) - (b.price || 0)
        case 'time':
          const dateA = typeof a.ride_datetime === 'string' 
            ? parseCustomDate(a.ride_datetime)
            : new Date(a.ride_datetime || '')
          const dateB = typeof b.ride_datetime === 'string'
            ? parseCustomDate(b.ride_datetime)
            : new Date(b.ride_datetime || '')
          return dateA.getTime() - dateB.getTime()
        case 'rating':
          return (b.rating || 0) - (a.rating || 0)
        default:
          return 0
      }
    })

    return filtered
  }, [filters, searchQuery, userLocation])

  // Debounced filter application
  const debouncedApplyFilters = useMemo(() => debounce((results: SearchResult[]) => {
    const filteredResults = applyFilters(results)
    setDisplayedResults(filteredResults.slice(0, currentIndex))
    setHasMore(filteredResults.length > currentIndex)
  }, 300), [applyFilters, currentIndex])

  // Handle search
  const handleSearch = useCallback(async (text: string) => {
    setSearchQuery(text)
    if (!text.trim()) {
      // When search is cleared, show all results
      const filteredResults = applyFilters(allResults)
      setDisplayedResults(filteredResults.slice(0, RIDES_PER_PAGE))
      setCurrentIndex(RIDES_PER_PAGE)
      setHasMore(filteredResults.length > RIDES_PER_PAGE)
      return
    }
    setLoading(true)
    try {
      const filteredResults = applyFilters(allResults)
      setDisplayedResults(filteredResults.slice(0, RIDES_PER_PAGE))
      setCurrentIndex(RIDES_PER_PAGE)
      setHasMore(filteredResults.length > RIDES_PER_PAGE)
    } catch (error) {
      setDisplayedResults([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [allResults, applyFilters])

  // Load more results
  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    setTimeout(() => {
      const filteredResults = applyFilters(allResults)
      const nextIndex = currentIndex + RIDES_PER_PAGE
      setDisplayedResults(filteredResults.slice(0, nextIndex))
      setCurrentIndex(nextIndex)
      setHasMore(filteredResults.length > nextIndex)
      setLoadingMore(false)
    }, 300)
  }, [loadingMore, hasMore, currentIndex, allResults, applyFilters])

  // Handle date change
  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false)
    if (selectedDate) {
      setFilters(prev => ({ ...prev, date: selectedDate }))
      // Apply filters immediately when date changes
      const filteredResults = applyFilters(allResults)
      setDisplayedResults(filteredResults.slice(0, currentIndex))
      setHasMore(filteredResults.length > currentIndex)
    }
  }

  // Helper function to get formatted date
  const getFormattedDate = (daysFromNow: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + daysFromNow);
    return date.toLocaleDateString('en-US', { 
      month: 'numeric', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Render filter button
  const renderFilterButton = (filter: string, label: string) => (
    <TouchableOpacity
      onPress={() => {
        setActiveFilter(filter);
        // Apply date filter
        let filterDate = null;
        const now = new Date();
        
        switch (filter) {
          case FILTERS.TODAY:
            filterDate = new Date(now);
            break;
          case FILTERS.TOMORROW:
            filterDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            break;
          case FILTERS.DAY_AFTER_TOMORROW:
            filterDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
            break;
          case FILTERS.DAY_3:
            filterDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
            break;
          case FILTERS.DAY_4:
            filterDate = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
            break;
          case FILTERS.DAY_5:
            filterDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
            break;
        }
        
        setFilters(prev => ({ ...prev, date: filterDate }));
      }}
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

  // Handle gender filter change
  const handleGenderFilter = (gender: string) => {
    console.log('\n=== Gender Filter Change ===')
    console.log('Changing gender filter to:', gender)
    
    setFilters(prev => {
      const newFilters = { ...prev, gender }
      console.log('New filters state:', newFilters)
      return newFilters
    })

    // Apply filters immediately when gender changes
    const filteredResults = applyFilters(allResults)
    console.log('Filtered results count:', filteredResults.length)
    
    setDisplayedResults(filteredResults.slice(0, currentIndex))
    setHasMore(filteredResults.length > currentIndex)
    
    console.log('=== End Gender Filter Change ===\n')
  }

  // Render filter modal
  const renderFilterModal = () => (
    <Modal
      isVisible={showFilters}
      onBackdropPress={() => setShowFilters(false)}
      style={{ justifyContent: 'flex-end', margin: 0 }}
    >
      <View className="bg-white rounded-t-3xl p-6 max-h-[92%]">
        {/* Header */}
        <View className={`flex-row justify-between items-center mb-6 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <Text className={`text-xl ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'تصفية النتائج' : 'Filter Results'}
          </Text>
          <TouchableOpacity 
            onPress={() => setShowFilters(false)}
            className="p-2 rounded-full bg-gray-50"
          >
            <Image source={icons.close} className="w-5 h-5" />
          </TouchableOpacity>
        </View>

        {/* Distance Filter */}
        <View className="mb-6">
          <Text className={`text-base ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} mb-3 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'المسافة (كم)' : 'Distance (km)'}
          </Text>
          <View className={`flex-row items-center justify-between bg-gray-50 p-3 rounded-xl ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <TouchableOpacity
              onPress={() => setFilters(prev => ({ ...prev, distance: Math.max((prev.distance || 0) - 1, MIN_DISTANCE_KM) }))}
              className="bg-primary/10 p-3 rounded-full"
            >
              <Text className="text-primary text-xl font-CairoBold">-</Text>
            </TouchableOpacity>
            <TextInput
              style={{ width: 60, textAlign: 'center' }}
              className={`text-lg ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-gray-800 bg-transparent mx-2`}
              keyboardType="numeric"
              value={filters.distance?.toString() || ''}
              onChangeText={val => {
                let num = parseInt(val.replace(/[^0-9]/g, ''))
                if (isNaN(num)) num = MIN_DISTANCE_KM
                if (num > MAX_DISTANCE_KM) num = MAX_DISTANCE_KM
                if (num < MIN_DISTANCE_KM) num = MIN_DISTANCE_KM
                setFilters(prev => ({ ...prev, distance: num }))
              }}
              placeholder={language === 'ar' ? 'المسافة' : 'Distance'}
              maxLength={3}
              returnKeyType="done"
              textAlign="center"
            />
            <TouchableOpacity
              onPress={() => setFilters(prev => ({ ...prev, distance: Math.min((prev.distance || 0) + 1, MAX_DISTANCE_KM) }))}
              className="bg-primary/10 p-3 rounded-full"
            >
              <Text className="text-primary text-xl font-CairoBold">+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Filter */}
        <View className="mb-6">
          <Text className={`text-base font-CairoBold mb-3 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'الحالة' : 'Status'}
          </Text>
          <View className="flex-row flex-wrap">
            {STATUS_OPTIONS.map((status) => (
              <TouchableOpacity
                key={status}
                onPress={() => {
                  let newStatus: string[]
                  if (status === 'all') {
                    newStatus = ['all']
                  } else {
                    newStatus = filters.status?.includes(status)
                      ? filters.status.filter(s => s !== status && s !== 'all')
                      : [...(filters.status?.filter(s => s !== 'all') || []), status]
                  }
                  setFilters(prev => ({ ...prev, status: newStatus }))
                }}
                className={`px-4 py-2.5 rounded-full mr-2 mb-2 ${
                  filters.status?.includes(status)
                    ? status === 'all'
                      ? 'bg-orange-500'
                      : status === 'available'
                      ? 'bg-green-100'
                      : status === 'pending'
                      ? 'bg-yellow-100'
                      : 'bg-red-100'
                    : 'bg-gray-50'
                }`}
              >
                <Text
                  className={`font-CairoBold ${
                    filters.status?.includes(status)
                      ? status === 'all'
                        ? 'text-white'
                        : status === 'available'
                        ? 'text-green-700'
                        : status === 'pending'
                        ? 'text-yellow-700'
                        : 'text-red-700'
                      : 'text-gray-600'
                  }`}
                >
                  {language === 'ar'
                    ? status === 'all'
                      ? 'الكل'
                      : status === 'available'
                      ? 'متاح'
                      : status === 'pending'
                      ? 'قيد الانتظار'
                      : status === 'in-progress'
                      ? 'قيد الانتظار'
                      : status === 'completed'
                      ? 'منتهي'
                      : 'ملغي'
                    : status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Date Filter */}
        <View className="mb-6">
          <Text className={`text-base font-CairoBold mb-3 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'التاريخ' : 'Date'}
          </Text>
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            className={`bg-gray-50 p-4 rounded-xl border border-gray-200 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} items-center justify-between`}
          >
            <Text className={`text-gray-700 font-CairoMedium ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {filters.date ? filters.date.toLocaleDateString() : language === 'ar' ? 'اختر التاريخ' : 'Select Date'}
            </Text>
            <Image source={icons.calendar} className="w-5 h-5" tintColor="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Gender Filter */}
        <View className="mb-6">
          <Text className={`text-base font-CairoBold mb-3 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'الجنس' : 'Gender'}
          </Text>
          <View className="flex-row flex-wrap">
            {GENDER_OPTIONS.map((gender) => (
              <TouchableOpacity
                key={gender}
                onPress={() => handleGenderFilter(gender)}
                className={`px-4 py-2.5 rounded-full mr-2 mb-2 ${
                  filters.gender === gender
                    ? gender === 'any'
                      ? 'bg-orange-500'
                      : gender === 'male'
                      ? 'bg-blue-100'
                      : 'bg-pink-100'
                    : 'bg-gray-50'
                }`}
              >
                <Text
                  className={`font-CairoBold ${
                    filters.gender === gender
                      ? gender === 'any'
                        ? 'text-white'
                        : gender === 'male'
                        ? 'text-blue-700'
                        : 'text-pink-700'
                      : 'text-gray-600'
                  }`}
                >
                  {language === 'ar'
                    ? gender === 'any'
                      ? 'الكل'
                      : gender === 'male'
                      ? 'ذكر'
                      : 'أنثى'
                    : gender.charAt(0).toUpperCase() + gender.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Apply Filters Button */}
        <View className={`flex-row space-x-3 mt-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              setFilters({
                type: 'all',
                sortBy: 'time',
                maxPrice: undefined,
                minRating: undefined,
                distance: MAX_DISTANCE_KM,
                status: [],
                date: null,
                gender: 'any',
                // recurring: 'all' as 'all',
              })
            }}
            className="flex-1 bg-red-50 py-4 rounded-xl border border-red-200"
          >
            <Text className={`text-red-500 text-center ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-lg`}>
              {language === 'ar' ? 'إعادة تعيين' : 'Reset'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
              setShowFilters(false)
              debouncedApplyFilters(allResults)
            }}
            className="flex-1 bg-orange-500 py-4 rounded-xl"
          >
            <Text className={`text-white text-center ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-lg`}>
              {language === 'ar' ? 'تطبيق' : 'Apply'}
            </Text>
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={filters.date || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}
      </View>
    </Modal>
  )

  // Render search result
  const renderSearchResult = ({ item }: { item: SearchResult }) => {
    if (item.type === 'ride') {
      const dateObj = parseCustomDate(item.ride_datetime || '')
      const dayOfWeek = dateObj.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long' })
      const dateDisplay = dateObj.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US')
      const timeDisplay = dateObj.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })
      const statusColor = item.status === 'available' ? 'bg-green-50 text-green-600' : 
                         item.status === 'pending' ? 'bg-yellow-50 text-yellow-600' : 
                         item.status === 'ended' ? 'bg-red-50 text-red-600' : 
                         item.status === 'cancelled' ? 'bg-red-50 text-red-600' :
                         item.status === 'in-progress' ? 'bg-blue-50 text-blue-600' :
                         item.status === 'completed' ? 'bg-green-50 text-green-600' :
                         item.status === 'full' ? 'bg-red-50 text-red-600' :
                         'bg-gray-100 text-gray-700'

      return (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            router.push({ pathname: "/(root)/ride-details/[id]", params: { id: item.id } })
          }}
          className="bg-white p-5 rounded-2xl mb-4 mx-2"
          style={Platform.OS === 'android' ? { elevation: 5 } : styles.iosShadow}
        >
          {/* Status Badge */}
          <View className={`absolute top-4 ${language === 'ar' ? 'left-4' : 'right-4'} z-10`}>
            <View className={`px-3 py-1.5 rounded-full ${statusColor}`}>
              <Text className={`text-xs ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                {item.status === 'ended' ? (language === 'ar' ? 'منتهي' : 'Ended') :
                 item.status === 'cancelled' ? (language === 'ar' ? 'ملغي' : 'Cancelled') :
                 item.status === 'in-progress' ? (language === 'ar' ? 'قيد الانتظار' : 'Pending') :
                 item.status === 'completed' ? (language === 'ar' ? 'منتهي' : 'Ended') :
                 item.status === 'available' ? (language === 'ar' ? 'متاح' : 'Available') :
                 item.status === 'pending' ? (language === 'ar' ? 'قيد الانتظار' : 'Pending') :
                 item.status === 'full' ? (language === 'ar' ? 'ممتلئ' : 'Full') :
                 (language === 'ar' ? 'متاح' : 'Available')  }
              </Text>
            </View>
          </View>

          {/* Driver Info */}
          <View className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <View className="relative">
              <Image
                source={item.profile_image_url ? { uri: item.profile_image_url } : icons.profile}
                className={`w-12 h-12 rounded-full ${language === 'ar' ? 'ml-3' : 'mr-3'}`}
              />
              {item.rating && (
                <View className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 border border-gray-100">
                  <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Image source={icons.star} className={`w-3 h-3 ${language === 'ar' ? 'ml-0.5' : 'mr-0.5'}`} tintColor="#F59E0B" />
                    <Text className={`text-xs ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-gray-800`}>
                      {item.rating.toFixed(1)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
            <View className={language === 'ar' ? 'items-end' : 'items-start'}>
              <Text className={`text-base ${language === 'ar' ? 'font-CairoBold' : 'font-CairoBold'} ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {item.name || (language === 'ar' ? 'السائق' : 'Driver')}
              </Text>
              <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {item.car_type || (language === 'ar' ? 'نوع السيارة غير متوفر' : 'Car type not available')}
              </Text>
            </View>
          </View>

          {/* Route Info */}
          <View className="bg-gray-50 rounded-xl p-4 mb-4">
            <View className={`flex-row items-start mb-3 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <View className="flex-1">
                <View className={`flex-row items-center mb-2 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <Image source={icons.pin} resizeMode="contain" className={`w-5 h-5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                  <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} ${language === 'ar' ? 'ml-2' : 'mr-2'}`}>
                    {language === 'ar' ? 'من' : 'From'}:
                  </Text>
                  <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium mt-2' : 'font-CairoMedium mt-2'} flex-1 ${language === 'ar' ? 'text-right' : 'text-left'}`} numberOfLines={1}>
                    {item.origin}
                  </Text>
                </View>

                {item.waypoints && item.waypoints.length > 0 && (
                  <View className="mt-2 mb-2 ">
                     <View className={`flex-row items-center mb-2 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <Image source={icons.map} resizeMode="contain" tintColor="#F79824" className={`w-5 h-5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                        <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} ${language === 'ar' ? 'ml-2' : 'mr-2'}`}>
                          {language === 'ar' ? 'نقاط التوقف' : 'Waypoints'}:
                        </Text>
                      </View>
                    <View className={`flex-row flex-wrap ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                      {item.waypoints.map((waypoint, index) => (
                        <View key={index} className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
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

                <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <Image source={icons.target} resizeMode="contain" className={`w-5 h-5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                  <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} ${language === 'ar' ? 'ml-2' : 'mr-2'}`}>
                    {language === 'ar' ? 'إلى' : 'To'}:
                  </Text>
                  <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium mt-2' : 'font-CairoMedium mt-2'} flex-1 ${language === 'ar' ? 'text-right' : 'text-left'}`} numberOfLines={1}>
                    {item.destination}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Ride Details */}
          <View className={`flex-row flex-wrap gap-y-3 justify-between items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <View className="bg-primary/10 p-2 rounded-lg">
                <Image source={icons.calendar} className={`w-5 h-5 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} tintColor="#F8780D" />
              </View>
              <View className={`${language === 'ar' ? 'mr-3' : 'ml-3'}`}>
                <Text className={`text-sm ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {dayOfWeek}
                </Text>
                <Text className={`text-xs ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} text-gray-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {dateDisplay}
                </Text>
              </View>
            </View>

            <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <View className="bg-primary/10 p-2 rounded-lg">
                <Image source={icons.clock} className={`w-5 h-5 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} tintColor="#F8780D" />
              </View>
              <View className={`${language === 'ar' ? 'mr-3' : 'ml-3'}`}>
                <Text className={`text-sm ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {timeDisplay}
                </Text>
                <Text className={`text-xs ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} text-gray-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'وقت الرحلة' : 'Ride Time'}
                </Text>
              </View>
            </View>

            <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <View className="bg-primary/10 p-2 rounded-lg">
                <Image source={icons.person} className={`w-5 h-5 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} tintColor="#F8780D" />
              </View>
              <View className={`${language === 'ar' ? 'mr-3' : 'ml-3'}`}>
                <Text className={`text-sm ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {item.available_seats}
                </Text>
                <Text className={`text-xs ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} text-gray-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'المقاعد المتاحة' : 'Available Seats'}
                </Text>
              </View>
            </View>

            {item.price && (
              <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <View className="bg-primary/10 p-2 rounded-lg">
                  <Image source={icons.car} className={`w-5 h-5 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} tintColor="#4F46E5" />
                </View>
                <View className={`${language === 'ar' ? 'mr-3' : 'ml-3'}`}>
                  <Text className={`text-sm ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {item.price} {language === 'ar' ? 'ر.س' : 'SAR'}
                  </Text>
                  <Text className={`text-xs ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} text-gray-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {language === 'ar' ? 'السعر' : 'Price'}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </TouchableOpacity>
      )
    }

    return (
      <TouchableOpacity
        className="bg-white p-4 rounded-xl mb-3 shadow-sm border border-gray-100"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          router.push({ pathname: "/(root)/driver-profile/[id]", params: { id: item.id } })
        }}
      >
        <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 border-2 border-primary/20">
            {item.profile_image_url ? (
              <Image source={{ uri: item.profile_image_url }} className="w-full h-full" />
            ) : (
              <View className="w-full h-full bg-primary items-center justify-center">
                <Text className="text-white text-xl">{item.name?.[0]?.toUpperCase() || 'D'}</Text>
              </View>
            )}
          </View>
          <View className={`${language === 'ar' ? 'mr-4' : 'ml-4'} flex-1`}>
            <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {item.name}
            </Text>
            <View className={`flex-row flex-wrap items-center mt-1 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <View className="bg-gray-50 px-3 py-1 rounded-full">
                <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                  {language === 'ar' ? 'سائق' : 'Driver'}
                </Text>
              </View>
              {item.car_type && (
                <View className={`bg-gray-50 px-3 py-1 rounded-full ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
                  <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                    {item.car_type}
                  </Text>
                </View>
              )}
              {item.rating && (
                <View className={`bg-gray-50 px-3 py-1 rounded-full ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
                  <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Image source={icons.star} className={`w-3 h-3 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} tintColor="#F59E0B" />
                    <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                      {item.rating.toFixed(1)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    )
  }

  // Helper to determine if a ride is valid
  const isValidRide = (ride: any) => {
    const rideDate = parseCustomDate(ride.ride_datetime)
    const currentDate = new Date()
    return rideDate > currentDate
  }

  // Initial fetch
  useEffect(() => {
    fetchAllRides()
    fetchUserLocation()
  }, [fetchAllRides, fetchUserLocation])

  // Apply filters when filters or results change
  useEffect(() => {
    debouncedApplyFilters(allResults)
  }, [allResults, filters, debouncedApplyFilters])

  // Skeleton Loading Component
  const SearchResultSkeleton = () => {
    return (
      <Animated.View 
        entering={FadeIn}
        className="bg-white p-5 rounded-2xl mb-4 mx-2"
        style={Platform.OS === 'android' ? { elevation: 5 } : styles.iosShadow}
      >
        {/* Status Badge Skeleton */}
        <View className={`absolute top-4 ${language === 'ar' ? 'left-4' : 'right-4'} z-10`}>
          <View className="w-20 h-6 bg-gray-200 rounded-full animate-pulse" />
        </View>

        {/* Driver Info Skeleton */}
        <View className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className="relative">
            <View className={`w-12 h-12 rounded-full bg-gray-200 animate-pulse ${language === 'ar' ? 'ml-3' : 'mr-3'}`} />
            <View className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 border border-gray-100">
              <View className="w-8 h-4 bg-gray-200 rounded-full animate-pulse" />
            </View>
          </View>
          <View className={language === 'ar' ? 'items-end' : 'items-start'}>
            <View className="w-24 h-5 bg-gray-200 rounded-full animate-pulse mb-2" />
            <View className="w-20 h-4 bg-gray-200 rounded-full animate-pulse" />
          </View>
        </View>

        {/* Route Info Skeleton */}
        <View className="bg-gray-50 rounded-xl p-4 mb-4">
          <View className={`flex-row items-start mb-3 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <View className="flex-1">
              <View className={`flex-row items-center mb-2 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <View className={`w-5 h-5 bg-gray-200 rounded-full animate-pulse ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                <View className="w-16 h-4 bg-gray-200 rounded-full animate-pulse" />
                <View className="flex-1 h-4 bg-gray-200 rounded-full animate-pulse mx-2" />
              </View>
              <View className={`flex-row items-center mb-2 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <View className={`w-5 h-5 bg-gray-200 rounded-full animate-pulse ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                <View className="w-16 h-4 bg-gray-200 rounded-full animate-pulse" />
                <View className="flex-1 h-4 bg-gray-200 rounded-full animate-pulse mx-2" />
              </View>
              <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <View className={`w-5 h-5 bg-gray-200 rounded-full animate-pulse ${language === 'ar' ? 'ml-2' : 'mr-2'}`} />
                <View className="w-16 h-4 bg-gray-200 rounded-full animate-pulse" />
                <View className="flex-1 h-4 bg-gray-200 rounded-full animate-pulse mx-2" />
              </View>
            </View>
          </View>
        </View>

        {/* Ride Details Skeleton */}
        <View className={`flex-row flex-wrap gap-y-3 justify-between items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          {[1, 2, 3, 4].map((_, index) => (
            <View key={index} className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <View className="bg-gray-200 p-2 rounded-lg animate-pulse">
                <View className={`w-5 h-5 ${language === 'ar' ? 'ml-1' : 'mr-1'}`} />
              </View>
              <View className={`${language === 'ar' ? 'mr-3' : 'ml-3'}`}>
                <View className="w-16 h-4 bg-gray-200 rounded-full animate-pulse mb-1" />
                <View className="w-12 h-3 bg-gray-200 rounded-full animate-pulse" />
              </View>
            </View>
          ))}
        </View>
      </Animated.View>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header profileImageUrl={profileImageUrl} title={t.Search} />
      <View className="px-4 py-3 bg-white border-b border-gray-100">
        <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className="flex-1 flex-row items-center bg-gray-50 rounded-full px-4 py-2">
            <Image source={icons.search} className={`w-5 h-5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`} tintColor="#6B7280" />
            <TextInput
              placeholder={language === 'ar' ? 'ابحث عن رحلات' : 'Search for rides'}
              value={searchQuery}
              onChangeText={handleSearchInput}
              className={`flex-1 ${language === 'ar' ? 'text-right' : 'text-left'} ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-gray-700`}
              placeholderTextColor="#9CA3AF"
              autoFocus={true}
              textAlign={language === 'ar' ? 'right' : 'left'}
            />
          </View>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              setShowFilters(true)
            }}
            className={`bg-gray-50 p-2 rounded-full ${language === 'ar' ? 'ml-2' : 'mr-2'}`}
          >
            <Image source={icons.filter} className="w-6 h-6" tintColor="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Date Filter Buttons */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          className="mt-4"
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

      <View className="flex-1 px-4">
        {loading ? (
          <View className="flex-1 py-8">
            {[1, 2, 3].map((_, index) => (
              <SearchResultSkeleton key={index} />
            ))}
          </View>
        ) : displayedResults.length > 0 ? (
          <FlatList
            data={displayedResults}
            renderItem={renderSearchResult}
            keyExtractor={(item) => `${item.type}-${item.id}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingVertical: 16, paddingBottom: 80 }}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={() => (
              loadingMore ? (
                <View className="py-4">
                  <ActivityIndicator size="small" color="#4F46E5" />
                </View>
              ) : hasMore ? (
                <TouchableOpacity
                  onPress={handleLoadMore}
                  className="bg-primary/10 py-3 rounded-xl mb-4"
                >
                  <Text className="text-primary text-center font-CairoBold">
                    {language === 'ar' ? 'تحميل المزيد' : 'Load More'}
                  </Text>
                </TouchableOpacity>
              ) : null
            )}
          />
        ) : (
          <View className="flex-1 items-center justify-center py-20">
            <Image source={icons.search} className="w-16 h-16 mb-4" tintColor="#9CA3AF" />
            <Text className={`text-gray-500 text-lg font-CairoBold ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {language === 'ar' ? 'لا توجد نتائج' : 'No results found'}
            </Text>
            <Text className={`text-gray-400 text-base mt-2 font-CairoBold ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {language === 'ar' ? 'جرب كلمة بحث مختلفة' : 'Try a different search term'}
            </Text>
          </View>
        )}
      </View>

      {renderFilterModal()}
    </SafeAreaView>
  )
}

export default Search

const styles = StyleSheet.create({
  iosShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
})