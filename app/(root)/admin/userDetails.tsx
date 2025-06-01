import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '@/context/LanguageContext';
import { icons } from '@/constants';
import Header from '@/components/Header';

interface Ride {
  id: string;
  status: string;
  price?: number;
  rating?: number;
  origin_address: string;
  destination_address: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_latitude: number;
  destination_longitude: number;
  driver_id: string;
  created_at: any;
  completedAt?: string;
  cancelledAt?: string;
  available_seats: number;
  is_recurring: boolean;
  no_children: boolean;
  no_music: boolean;
  no_smoking: boolean;
  required_gender: string;
  ride_datetime: string;
  ride_days?: string[];
  ride_number: number;
  ride_id?: string;
  driver_name?: string;
  driver_phone?: string;
  driver_car_type?: string;
  driver_car_seats?: number;
}

interface DriverDetails {
  approved_at: string;
  car_image_url: string;
  car_seats: number;
  car_type: string;
  created_at: string;
  is_active: boolean;
  profile_image_url: string;
  rejection_reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  user_email: string;
  user_id: string;
  user_name: string;
  rating?: number;
  total_rides?: number;
}

interface UserDetails {
  clerkId: string;
  createdAt: string;
  driver?: DriverDetails;
  email: string;
  gender: string;
  industry: string;
  name: string;
  phone: string;
  profile_image_url: string;
  pushToken: string;
  role: string;
  totalRides?: number;
  averageRating?: number;
  totalEarnings?: number;
}

interface DetailedRating {
  overall: number;
  driving: number;
  behavior: number;
  punctuality: number;
  cleanliness: number;
  comment?: string;
  passenger_name: string;
  created_at: any;
  ride_details: {
    origin_address: string;
    destination_address: string;
    ride_datetime: string;
  };
}

interface RideDetails {
  driver_id: string;
  driver_name: string;
  driver_phone: string;
  driver_car_type: string;
  driver_car_seats: number;
  origin_address: string;
  destination_address: string;
  ride_datetime: string;
  available_seats: number;
  is_recurring: boolean;
  ride_days: string[];
}

const SkeletonProfileSection = () => (
  <View className="bg-white p-4 mb-4">
    <View className="items-center mb-6">
      <View className="w-24 h-24 rounded-full bg-gray-200 mb-4" />
      <View className="h-8 w-48 bg-gray-200 rounded mb-2" />
      <View className="h-5 w-64 bg-gray-200 rounded mb-2" />
      <View className="flex-row">
        <View className="h-8 w-24 bg-gray-200 rounded-full mr-2" />
        <View className="h-8 w-24 bg-gray-200 rounded-full" />
      </View>
    </View>
  </View>
);

const SkeletonBasicInfo = () => (
  <View className="bg-gray-50 rounded-xl p-4 mb-4">
    <View className="h-7 w-40 bg-gray-200 rounded mb-4" />
    <View className="space-y-3">
      {[1, 2, 3, 4].map((_, index) => (
        <View key={index}>
          <View className="h-4 w-24 bg-gray-200 rounded mb-1" />
          <View className="h-6 w-32 bg-gray-200 rounded" />
        </View>
      ))}
    </View>
  </View>
);

const SkeletonDriverStats = () => (
  <View className="flex-row justify-between mb-4">
    <View className="flex-1 bg-gray-50 rounded-xl p-4 mr-2">
      <View className="h-4 w-24 bg-gray-200 rounded mb-2" />
      <View className="h-8 w-16 bg-gray-200 rounded" />
    </View>
    <View className="flex-1 bg-gray-50 rounded-xl p-4 ml-2">
      <View className="h-4 w-20 bg-gray-200 rounded mb-2" />
      <View className="h-8 w-16 bg-gray-200 rounded" />
    </View>
  </View>
);

const SkeletonDriverInfo = () => (
  <View className="bg-gray-50 rounded-xl p-4 mb-4">
    <View className="h-7 w-40 bg-gray-200 rounded mb-4" />
    <View className="space-y-3">
      {[1, 2, 3, 4].map((_, index) => (
        <View key={index}>
          <View className="h-4 w-24 bg-gray-200 rounded mb-1" />
          <View className="h-6 w-32 bg-gray-200 rounded" />
        </View>
      ))}
      <View className="mt-4">
        <View className="h-4 w-24 bg-gray-200 rounded mb-2" />
        <View className="h-40 w-full bg-gray-200 rounded" />
      </View>
    </View>
  </View>
);

const SkeletonRideCard = () => (
  <View className="bg-white p-4 rounded-xl mb-3 shadow-sm">
    <View className="flex-row justify-between items-start mb-3">
      <View className="flex-1">
        <View className="flex-row items-center mb-2">
          <View className="h-4 w-4 bg-gray-200 rounded-full mr-2" />
          <View className="h-4 w-48 bg-gray-200 rounded" />
        </View>
        <View className="flex-row items-center">
          <View className="h-4 w-4 bg-gray-200 rounded-full mr-2" />
          <View className="h-4 w-48 bg-gray-200 rounded" />
        </View>
      </View>
      <View className="h-6 w-20 bg-gray-200 rounded-full" />
    </View>
    <View className="flex-row items-center justify-between border-t border-gray-100 pt-3">
      <View className="flex-row items-center">
        <View className="h-4 w-4 bg-gray-200 rounded-full mr-2" />
        <View className="h-4 w-32 bg-gray-200 rounded" />
      </View>
    </View>
  </View>
);

const UserDetails = () => {
  const { userId } = useLocalSearchParams();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [recentRides, setRecentRides] = useState<Ride[]>([]);
  const [ratings, setRatings] = useState<DetailedRating[]>([]);
  const [showRatings, setShowRatings] = useState(false);

  useEffect(() => {
    const fetchUserDetails = async () => {
      try {
        const userRef = doc(db, 'users', userId as string);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          Alert.alert('Error', 'User not found');
          router.back();
          return;
        }

        const userData = userSnap.data();
        setUserDetails({
          clerkId: userData.clerkId || '',
          createdAt: userData.createdAt || '',
          email: userData.email || '',
          gender: userData.gender || '',
          industry: userData.industry || '',
          name: userData.name || '',
          phone: userData.phone || '',
          profile_image_url: userData.profile_image_url || '',
          pushToken: userData.pushToken || '',
          role: userData.role || 'passenger',
          driver: userData.driver ? {
            approved_at: userData.driver.approved_at || '',
            car_image_url: userData.driver.car_image_url || '',
            car_seats: userData.driver.car_seats || 0,
            car_type: userData.driver.car_type || '',
            created_at: userData.driver.created_at || '',
            is_active: userData.driver.is_active || false,
            profile_image_url: userData.driver.profile_image_url || '',
            rejection_reason: userData.driver.rejection_reason || null,
            status: userData.driver.status || 'pending',
            user_email: userData.driver.user_email || '',
            user_id: userData.driver.user_id || '',
            user_name: userData.driver.user_name || '',
            rating: userData.driver.rating,
            total_rides: userData.driver.total_rides
          } : undefined
        });

        // Fetch detailed ratings if user is a driver
        if (userData.driver) {
          const ratingsQuery = query(
            collection(db, 'ratings'),
            where('driver_id', '==', userId)
          );
          
          const ratingsSnapshot = await getDocs(ratingsQuery);
          const ratingsData = ratingsSnapshot.docs.map(doc => ({
            ...doc.data()
          })) as DetailedRating[];
          
          setRatings(ratingsData);

          // Calculate average rating
          if (ratingsData.length > 0) {
            const avgRating = ratingsData.reduce((acc, curr) => acc + curr.overall, 0) / ratingsData.length;
          setUserDetails(prev => prev ? {
            ...prev,
              driver: {
                ...prev.driver!,
                rating: avgRating,
                total_rides: ratingsData.length
              }
          } : null);
          }
        }

        // Fetch user's rides
        let ridesQuery;
        
        if (userData.driver) {
          // For drivers, fetch from rides collection
          ridesQuery = query(
            collection(db, 'rides'),
            where('driver_id', '==', userId),
            where('status', '==', 'completed')
          );
        } else {
          // For passengers, fetch from ride_requests collection
          ridesQuery = query(
            collection(db, 'ride_requests'),
            where('passenger_id', '==', userId),
            where('status', 'in', ['accepted', 'checked_in', 'checked_out'])
          );
        }

        const unsubscribe = onSnapshot(ridesQuery, async (snapshot) => {
          const rides = await Promise.all(snapshot.docs.map(async (docSnapshot) => {
            const data = docSnapshot.data();
            const baseRideData: Ride = {
              id: docSnapshot.id,
              status: data.status || 'pending',
              origin_address: data.origin_address || data.origin?.address || '',
              destination_address: data.destination_address || data.destination?.address || '',
              origin_latitude: data.origin_latitude || 0,
              origin_longitude: data.origin_longitude || 0,
              destination_latitude: data.destination_latitude || 0,
              destination_longitude: data.destination_longitude || 0,
              driver_id: data.driver_id || '',
              created_at: data.created_at,
              completedAt: data.completedAt,
              cancelledAt: data.cancelledAt,
              available_seats: data.available_seats || 0,
              is_recurring: data.is_recurring || false,
              no_children: data.no_children || false,
              no_music: data.no_music || false,
              no_smoking: data.no_smoking || false,
              required_gender: data.required_gender || '',
              ride_datetime: data.ride_datetime || data.created_at?.toDate().toLocaleString() || '',
              ride_days: data.ride_days || [],
              ride_number: data.ride_number || 0,
              ride_id: data.ride_id,
              driver_name: data.driver_name,
              driver_phone: data.driver_phone,
              driver_car_type: data.driver_car_type,
              driver_car_seats: data.driver_car_seats
            };

            // If this is a passenger request and has a ride_id, fetch the associated ride details
            if (!userData.driver && data.ride_id) {
              try {
                const rideDocRef = doc(db, 'rides', data.ride_id);
                const rideDocSnap = await getDoc(rideDocRef);
                
                if (rideDocSnap.exists()) {
                  const rideDetails = rideDocSnap.data();
                  return {
                    ...baseRideData,
                    // Keep the original request data for status
                    status: data.status,
                    // Update with ride details
                    origin_address: rideDetails.origin_address || baseRideData.origin_address,
                    destination_address: rideDetails.destination_address || baseRideData.destination_address,
                    ride_datetime: rideDetails.ride_datetime || baseRideData.ride_datetime,
                    available_seats: rideDetails.available_seats || baseRideData.available_seats,
                    is_recurring: rideDetails.is_recurring || baseRideData.is_recurring,
                    ride_days: rideDetails.ride_days || baseRideData.ride_days,
                    // Add driver information
                    driver_id: rideDetails.driver_id || '',
                    driver_name: rideDetails.driver_name || '',
                    driver_phone: rideDetails.driver_phone || '',
                    driver_car_type: rideDetails.driver_car_type || '',
                    driver_car_seats: rideDetails.driver_car_seats || 0
                  };
                }
              } catch (error) {
                console.error('Error fetching ride details:', error);
              }
            }

            return baseRideData;
          }));

          setRecentRides(rides);
          setLoading(false);
        });

        return () => unsubscribe();
      } catch (error) {
        console.error('Error fetching user details:', error);
        Alert.alert('Error', 'Failed to fetch user details');
        setLoading(false);
      }
    };

    fetchUserDetails();
  }, [userId]);

  const handleStatusChange = async (newStatus: boolean) => {
    if (!userDetails?.driver) return;

    try {
      const userRef = doc(db, 'users', userId as string);
      await updateDoc(userRef, {
        'driver.is_active': newStatus,
        'driver.status': newStatus ? 'approved' : 'pending'
      });

      // Update local state
      setUserDetails(prev => prev ? {
        ...prev,
        driver: {
          ...prev.driver!,
          is_active: newStatus,
          status: newStatus ? 'approved' : 'pending'
        }
      } : null);

      Alert.alert(
        'Success',
        newStatus 
          ? (language === 'ar' ? 'تم تفعيل السائق بنجاح' : 'Driver activated successfully')
          : (language === 'ar' ? 'تم إيقاف السائق بنجاح' : 'Driver deactivated successfully')
      );
    } catch (error) {
      console.error('Error updating driver status:', error);
      Alert.alert(
        'Error',
        language === 'ar' ? 'فشل في تحديث حالة السائق' : 'Failed to update driver status'
      );
    }
  };

  const renderDetailedRatings = () => {
    if (!userDetails?.driver || ratings.length === 0) return null;

    return (
      <View className="bg-gray-50 rounded-xl p-4 mb-4">
        <TouchableOpacity 
          onPress={() => setShowRatings(!showRatings)}
          className="flex-row justify-between items-center mb-4"
        >
          <Text className={`text-lg font-bold ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
            {language === 'ar' ? 'التقييمات التفصيلية' : 'Detailed Ratings'}
          </Text>
          <MaterialCommunityIcons 
            name={showRatings ? "chevron-up" : "chevron-down"} 
            size={24} 
            color="#374151" 
          />
        </TouchableOpacity>

        {showRatings && (
          <View className="space-y-4">
            {ratings.map((rating, index) => (
              <View key={index} className={`bg-white p-4 rounded-xl ${language === 'ar' ? 'items-end' : 'items-start'}`}>
                <View className={`flex-row justify-between items-center mb-2 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600`}>
                    {rating.passenger_name}
                  </Text>
                  <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Text className={`text-base ${language === 'ar' ? 'font-CairoBold text-right mr-1' : 'font-JakartaBold text-left ml-1'} text-gray-900`}>
                      {rating.overall.toFixed(1)}
                    </Text>
                    <Image source={icons.star} style={{ width: 16, height: 16 }} />
                  </View>
                </View>

                <View className={`space-y-2 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
                  <View className={`flex-row justify-between w-full ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600`}>
                      {language === 'ar' ? 'قيادة السيارة' : 'Driving'}
                    </Text>
                    <Text className={`text-sm ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-gray-900`}>
                      {rating.driving}
                    </Text>
                  </View>
                  <View className={`flex-row justify-between w-full ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600`}>
                      {language === 'ar' ? 'الأخلاق والسلوك' : 'Behavior'}
                    </Text>
                    <Text className={`text-sm ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-gray-900`}>
                      {rating.behavior}
                    </Text>
                  </View>
                  <View className={`flex-row justify-between w-full ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600`}>
                      {language === 'ar' ? 'الالتزام بالمواعيد' : 'Punctuality'}
                    </Text>
                    <Text className={`text-sm ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-gray-900`}>
                      {rating.punctuality}
                    </Text>
                  </View>
                  <View className={`flex-row justify-between w-full ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600`}>
                      {language === 'ar' ? 'نظافة السيارة' : 'Cleanliness'}
                    </Text>
                    <Text className={`text-sm ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-gray-900`}>
                      {rating.cleanliness}
                    </Text>
                  </View>
                </View>

                {rating.comment && (
                  <View className={`mt-2 p-2 bg-gray-50 rounded-lg ${language === 'ar' ? 'items-end' : 'items-start'}`}>
                    <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600`}>
                      {rating.comment}
                    </Text>
                  </View>
                )}

                <Text className={`text-xs ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-500 mt-2`}>
                  {rating.ride_details.origin_address} → {rating.ride_details.destination_address}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <Header showProfileImage={false} showSideMenu={false} title={language === 'ar' ? 'تفاصيل المستخدم' : 'User Details'} />
        <ScrollView className="flex-1">
          <SkeletonProfileSection />
          <SkeletonBasicInfo />
          <SkeletonDriverStats />
          <SkeletonDriverInfo />
          <View className="bg-gray-50 rounded-xl p-4">
            <View className="h-7 w-40 bg-gray-200 rounded mb-4" />
            <SkeletonRideCard />
            <SkeletonRideCard />
            <SkeletonRideCard />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!userDetails) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="text-gray-600">User not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen 
        options={{
          headerTitle: language === 'ar' ? 'تفاصيل المستخدم' : 'User Details',
          headerTitleStyle: {
            fontSize: 18,
            fontFamily: language === 'ar' ? 'Cairo-Bold' : 'PlusJakartaSans-Bold',
          },
          headerTitleAlign: 'center',
        }} 
      />
      <SafeAreaView className="flex-1 bg-gray-50">
        <Header showProfileImage={false} showSideMenu={false} title={language === 'ar' ? 'تفاصيل المستخدم' : 'User Details'} />
        <ScrollView className="flex-1">
          <View className={`px-4 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
            {/* Profile Section */}
            <View className="w-full bg-white p-4 mb-4">
              <View className="items-center mb-6">
                {userDetails.profile_image_url ? (
                  <Image 
                    source={{ uri: userDetails.profile_image_url }}
                    className="w-24 h-24 rounded-full mb-4"
                  />
                ) : (
                  <View className="w-24 h-24 rounded-full bg-gray-200 items-center justify-center mb-4">
                    <MaterialCommunityIcons name="account" size={48} color="#6B7280" />
                  </View>
                )}
                <Text className={`text-2xl font-bold mb-1 text-center ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                  {userDetails.name}
                </Text>
                <Text className={`text-gray-600 mb-2 text-center ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                  {userDetails.email}
                </Text>
                <View className="flex-row justify-center">
                  <View className={`px-3 py-1 rounded-full ${language === 'ar' ? 'ml-2' : 'mr-2'} ${userDetails.role === 'admin' ? 'bg-purple-100' : userDetails.driver ? 'bg-green-100' : 'bg-blue-100'}`}>
                    <Text className={`${userDetails.role === 'admin' ? 'text-purple-700' : userDetails.driver ? 'text-green-700' : 'text-blue-700'} ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                      {userDetails.role === 'admin' ? 'Admin' : userDetails.driver ? 'Driver' : 'Passenger'}
                    </Text>
                  </View>
                  {userDetails.driver && (
                    <View className={`px-3 py-1 rounded-full ${userDetails.driver.is_active ? 'bg-green-100' : 'bg-yellow-100'}`}>
                      <Text className={`${userDetails.driver.is_active ? 'text-green-700' : 'text-yellow-700'} ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                        {userDetails.driver.is_active ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Statistics - Only for Drivers */}
            {userDetails.driver && (
              <View className="flex-row justify-between mb-4">
                <View className="flex-1 bg-gray-50 rounded-xl p-4 mr-2 border border-gray-100 items-center" style={{
                      elevation: Platform.OS === "android" ? 4 : 0,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 3,
                    }}>
                  <Text className={`text-gray-600 text-center ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                    {language === 'ar' ? 'إجمالي الرحلات' : 'Total Rides'}
                  </Text>
                  <View className="h-px bg-gray-300 w-full my-2" />
                  <Text className={`text-2xl font-bold text-center ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                    {userDetails.driver.total_rides || 0}
                  </Text>
                </View>
                <View className="flex-1 bg-gray-50 rounded-xl p-4 ml-2 border border-gray-100 items-center" style={{
                      elevation: Platform.OS === "android" ? 4 : 0,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 3,
                    }}>
                  <Text className={`text-gray-600 text-center ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                    {language === 'ar' ? 'التقييم' : 'Rating'}
                  </Text>
                  <View className="h-px bg-gray-300 w-full my-2" />
                  <View className="flex-row items-center justify-center">
                    <Text className={`text-2xl font-bold ${language === 'ar' ? 'font-CairoBold mr-1' : 'font-JakartaBold ml-1'}`}>
                      {userDetails.driver.rating?.toFixed(1) || '0.0'}
                    </Text>
                    <Image source={icons.star} style={{ width: 20, height: 20 }} />
                  </View>
                </View>
              </View>
            )}

            {/* Basic Information */}
            <View className="w-full bg-gray-50 rounded-xl p-4 mb-4">
              <Text className={`text-lg font-bold mb-4 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
                {language === 'ar' ? 'المعلومات الأساسية' : 'Basic Information'}
              </Text>
              <View className={`space-y-3 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
                <View>
                  <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                    {language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
                  </Text>
                  <Text className={`text-lg ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                    {userDetails.phone || '-'}
                  </Text>
                </View>
                <View>
                  <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                    {language === 'ar' ? 'الجنس' : 'Gender'}
                  </Text>
                  <Text className={`text-lg ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                    {userDetails.gender || '-'}
                  </Text>
                </View>
                <View>
                  <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                    {language === 'ar' ? 'القطاع' : 'Industry'}
                  </Text>
                  <Text className={`text-lg ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                    {userDetails.industry || '-'}
                  </Text>
                </View>
                <View>
                  <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                    {language === 'ar' ? 'تاريخ الإنشاء' : 'Created At'}
                  </Text>
                  <Text className={`text-lg ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                    {new Date(userDetails.createdAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Detailed Ratings */}
            {renderDetailedRatings()}

            {/* Driver Details */}
            {userDetails.driver && (
              <View className="w-full bg-gray-50 rounded-xl p-4 mb-4">
                <Text className={`text-lg font-bold mb-4 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
                  {language === 'ar' ? 'معلومات السائق' : 'Driver Information'}
                </Text>
                <View className={`space-y-3 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
                  <View>
                    <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                      {language === 'ar' ? 'الحالة' : 'Status'}
                    </Text>
                    <View className="flex-row items-center">
                      <View className={`px-3 py-1 rounded-full ${
                        userDetails.driver.status === 'approved' ? 'bg-green-100' :
                        userDetails.driver.status === 'rejected' ? 'bg-red-100' :
                        'bg-yellow-100'
                      }`}>
                        <Text className={`${
                          userDetails.driver.status === 'approved' ? 'text-green-700' :
                          userDetails.driver.status === 'rejected' ? 'text-red-700' :
                          'text-yellow-700'
                        } ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                          {userDetails.driver.status === 'approved' ? (language === 'ar' ? 'موافق' : 'Approved') :
                           userDetails.driver.status === 'rejected' ? (language === 'ar' ? 'مرفوض' : 'Rejected') :
                           (language === 'ar' ? 'قيد الانتظار' : 'Pending')}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className={`w-full ${language === 'ar' ? 'items-end' : 'items-start'}`}>
                    <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                      {language === 'ar' ? 'نوع السيارة' : 'Car Type'}
                    </Text>
                    <Text className={`text-lg ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                      {userDetails.driver.car_type || '-'}
                    </Text>
                    {userDetails.driver.car_image_url && (
                      <View className="mt-2 w-full">
                        <Image 
                          source={{ uri: userDetails.driver.car_image_url }}
                          className="w-full h-40 rounded-lg"
                          resizeMode="cover"
                        />
                      </View>
                    )}
                  </View>

                  <View className={`w-full ${language === 'ar' ? 'items-end' : 'items-start'}`}>
                    <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                      {language === 'ar' ? 'عدد المقاعد' : 'Number of Seats'}
                    </Text>
                    <Text className={`text-lg ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                      {userDetails.driver.car_seats || '-'}
                    </Text>
                  </View>

                  <View className={`w-full ${language === 'ar' ? 'items-end' : 'items-start'}`}>
                    <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                      {language === 'ar' ? 'تاريخ الموافقة' : 'Approval Date'}
                    </Text>
                    <Text className={`text-lg ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                      {userDetails.driver.approved_at ? new Date(userDetails.driver.approved_at).toLocaleDateString() : '-'}
                    </Text>
                    {userDetails.driver.approved_at && (
                      <Text className={`text-sm text-gray-500 mt-1 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                        {new Date(userDetails.driver.approved_at).toLocaleTimeString()}
                      </Text>
                    )}
                  </View>

                  {userDetails.driver.rejection_reason && (
                    <View>
                      <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                        {language === 'ar' ? 'سبب الرفض' : 'Rejection Reason'}
                      </Text>
                      <Text className={`text-lg ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                        {userDetails.driver.rejection_reason}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={() => handleStatusChange(!userDetails.driver?.is_active)}
                    className={`mt-4 py-2 px-4 rounded-full ${userDetails.driver.status === 'approved' ? 'bg-red-100' : 'bg-green-100'}`}
                  >
                    <Text className={`text-center ${userDetails.driver.status === 'approved' ? 'text-red-700' : 'text-green-700'} ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                      {userDetails.driver.status === 'approved'
                        ? (language === 'ar' ? 'إيقاف السائق' : 'Deactivate Driver')
                        : (language === 'ar' ? 'تفعيل السائق' : 'Activate Driver')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Recent Rides */}
            <View className="w-full bg-gray-50 rounded-xl p-4">
              <Text className={`text-lg font-bold mb-4 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
                {userDetails.driver 
                  ? (language === 'ar' ? 'الرحلات المكتملة' : 'Completed Rides')
                  : (language === 'ar' ? 'طلبات الرحلات' : 'Ride Requests')}
              </Text>
              {recentRides.length > 0 ? (
                recentRides.map(ride => (
                  <TouchableOpacity
                    key={ride.id}
                    onPress={() => router.push({
                      pathname: '/(root)/admin/rideDetails',
                      params: { 
                        rideId: userDetails.driver ? ride.id : ride.ride_id || ride.id 
                      }
                    } as any)}
                    className="w-full bg-white p-4 rounded-xl mb-3 border border-gray-100"
                    style={{
                      elevation: Platform.OS === "android" ? 4 : 0,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 3,
                    }}
                  >
                    <View className={`flex-row justify-between items-start mb-3 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <View className={`flex-1 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
                        <View className={`flex-row items-center mb-2 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                          <MaterialCommunityIcons name="map-marker" size={16} color="#F97316" />
                          <Text className={`${language === 'ar' ? 'mr-1 text-right' : 'ml-1 text-left'} font-medium ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                            {ride.origin_address}
                          </Text>
                        </View>
                        <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                          <MaterialCommunityIcons name="map-marker-check" size={16} color="#22C55E" />
                          <Text className={`${language === 'ar' ? 'mr-1 text-right' : 'ml-1 text-left'} font-medium ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                            {ride.destination_address}
                          </Text>
                        </View>
                      </View>
                      <View className={`px-3 py-1 rounded-full ${
                        userDetails.driver 
                          ? 'bg-green-100'
                          : ride.status === 'checked_out' 
                            ? 'bg-green-100'
                            : ride.status === 'checked_in'
                              ? 'bg-blue-100'
                              : 'bg-yellow-100'
                      }`}>
                        <Text className={`text-sm ${
                          userDetails.driver 
                            ? 'text-green-700'
                            : ride.status === 'checked_out'
                              ? 'text-green-700'
                              : ride.status === 'checked_in'
                                ? 'text-blue-700'
                                : 'text-yellow-700'
                        } ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                          {userDetails.driver 
                            ? (language === 'ar' ? 'مكتملة' : 'Completed')
                            : ride.status === 'checked_out'
                              ? (language === 'ar' ? 'مكتملة' : 'Completed')
                              : ride.status === 'checked_in'
                                ? (language === 'ar' ? 'تم تسجيل الدخول' : 'Checked In')
                                : (language === 'ar' ? 'مقبول' : 'Accepted')}
                        </Text>
                      </View>
                    </View>

                    <View className={`flex-row items-center ${language === 'ar' ? 'flex-row' : 'flex-row-reverse'}`}>
                      <MaterialCommunityIcons name="calendar-clock" size={16} color="#6B7280" />
                      <Text className={`${language === 'ar' ? 'mr-1 text-right' : 'ml-1 text-left'} text-gray-600 ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                        {(() => {
                          const [datePart, timePart] = ride.ride_datetime.split(' ');
                          const [day, month, year] = datePart.split('/').map(Number);
                          const [hours, minutes] = timePart.split(':').map(Number);
                          const date = new Date(year, month - 1, day, hours, minutes);
                          
                          return date.toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          });
                        })()}
                      </Text>
                    </View>

                    <View className={`flex-row justify-between items-center ${language === 'ar' ? 'flex-row' : 'flex-row-reverse'}`}>
                      {ride.is_recurring && (
                        <View className={`mt-3 flex-row items-center ${language === 'ar' ? 'flex-row' : 'flex-row-reverse'}`}>
                          <MaterialCommunityIcons name="repeat" size={16} color="#6B7280" />
                          <Text className={`${language === 'ar' ? 'mr-1 text-right' : 'ml-1 text-left'} text-gray-600 ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                            {language === 'ar' ? 'رحلة متكررة' : 'Recurring Ride'} - {ride.ride_days?.join(', ')}
                          </Text>
                        </View>
                      )}
                      <View className={`flex-row mt-2 items-center ${language === 'ar' ? 'flex-row' : 'flex-row-reverse'}`}>
                        <MaterialCommunityIcons name="seat-passenger" size={16} color="#6B7280" />
                        <Text className={`${language === 'ar' ? 'mr-1 text-right' : 'ml-1 text-left'} text-gray-600 ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                          {ride.available_seats} {language === 'ar' ? 'مقاعد' : 'Seats'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <Text className={`text-gray-600 py-4 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                  {userDetails.driver 
                    ? (language === 'ar' ? 'لا توجد رحلات مكتملة' : 'No completed rides found')
                    : (language === 'ar' ? 'لا توجد طلبات رحلات' : 'No ride requests found')}
                </Text>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
};

export default UserDetails; 