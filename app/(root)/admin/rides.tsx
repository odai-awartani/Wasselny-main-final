import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { useUser } from '@clerk/clerk-expo';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '@/context/LanguageContext';
import Header from '@/components/Header';

interface UserData {
  name: string;
  phoneNumber: string;
  email: string;
}

interface Ride {
  id: string;
  driver_id?: string;
  status: 'available' | 'full' | 'in-progress' | 'completed' | 'on-hold' | 'cancelled';
  origin_address: string;
  destination_address: string;
  origin_latitude?: number;
  origin_longitude?: number;
  destination_latitude?: number;
  destination_longitude?: number;
  ride_datetime: string;
  available_seats: number;
  fare_price?: number;
  created_at: any;
  driver?: {
    name: string;
    phoneNumber: string;
    email: string;
  };
}

const SkeletonRideCard = ({ language }: { language: string }) => {
  const isRTL = language === 'ar';
  return (
    <View className="bg-white rounded-xl p-4 mb-4 shadow-sm border border-gray-100">
      <View className={`flex-row justify-between items-start ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
        <View className="flex-1">
          <View className={`h-6 w-64 bg-gray-200 rounded mb-2 ${isRTL ? 'self-end' : 'self-start'}`} />
          <View className={`flex-row items-center mb-2 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
            <View className={`h-4 w-4 bg-gray-200 rounded-full ${isRTL ? 'ml-2' : 'mr-2'}`} />
            <View className="h-4 w-32 bg-gray-200 rounded" />
          </View>
          <View className={`flex-row items-center mb-2 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
            <View className={`h-4 w-4 bg-gray-200 rounded-full ${isRTL ? 'ml-2' : 'mr-2'}`} />
            <View className="h-4 w-32 bg-gray-200 rounded" />
          </View>
          <View className={`h-6 w-20 bg-gray-200 rounded-full ${isRTL ? 'self-end' : 'self-start'}`} />
        </View>
        <View className="h-10 w-10 bg-gray-200 rounded-full" />
      </View>
    </View>
  );
};

const RidesManagement = () => {
  const { user } = useUser();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [rides, setRides] = useState<Ride[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'full' | 'in-progress' | 'completed' | 'on-hold' | 'cancelled'>('all');

  useEffect(() => {
    const fetchRides = async () => {
      try {
        const ridesQuery = query(collection(db, 'rides'));

        const unsubscribe = onSnapshot(ridesQuery, async (snapshot) => {
          const ridesData = await Promise.all(
            snapshot.docs.map(async (docSnapshot) => {
              const rideData = docSnapshot.data();
              const ride = {
                id: docSnapshot.id,
                ...rideData,
                status: rideData.status || 'available',
                fare_price: rideData.fare_price || 0,
                created_at: rideData.created_at || new Date().toISOString()
              } as Ride;

              // Fetch driver details
              if (ride.driver_id) {
                const driverRef = doc(db, 'users', ride.driver_id);
                const driverSnap = await getDoc(driverRef);
                if (driverSnap.exists()) {
                  const driverData = driverSnap.data() as UserData;
                  ride.driver = {
                    name: driverData.name || '',
                    phoneNumber: driverData.phoneNumber || '',
                    email: driverData.email || ''
                  };
                }
              }

              return ride;
            })
          );

          setRides(ridesData);
          setLoading(false);
        });

        return () => unsubscribe();
      } catch (error) {
        console.error('Error fetching rides:', error);
        setLoading(false);
      }
    };

    fetchRides();
  }, []);

  const filteredRides = rides.filter(ride => {
    const matchesSearch =
      (ride.driver?.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (ride.origin_address?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (ride.destination_address?.toLowerCase() || '').includes(searchQuery.toLowerCase());

    const matchesFilter = filter === 'all' || ride.status === filter;

    return matchesSearch && matchesFilter;
  });

  const handleStatusChange = async (rideId: string, newStatus: Ride['status']) => {
    try {
      const rideRef = doc(db, 'rides', rideId);
      await updateDoc(rideRef, { status: newStatus });
      Alert.alert('Success', 'Ride status updated successfully');
    } catch (error) {
      console.error('Error updating ride status:', error);
      Alert.alert('Error', 'Failed to update ride status');
    }
  };

  const getStatusColor = (status: Ride['status']) => {
    switch (status) {
      case 'in-progress':
        return 'bg-green-100 text-green-700';
      case 'completed':
        return 'bg-blue-100 text-blue-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      case 'full':
        return 'bg-purple-100 text-purple-700';
      case 'on-hold':
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusText = (status: Ride['status']) => {
    switch (status) {
      case 'in-progress':
        return language === 'ar' ? 'قيد التنفيذ' : 'In Progress';
      case 'completed':
        return language === 'ar' ? 'مكتملة' : 'Completed';
      case 'cancelled':
        return language === 'ar' ? 'ملغاة' : 'Cancelled';
      case 'full':
        return language === 'ar' ? 'ممتلئة' : 'Full';
      case 'on-hold':
        return language === 'ar' ? 'معلقة' : 'On Hold';
      default:
        return language === 'ar' ? 'متاح' : 'Available';
    }
  };

  const RideCard = ({ ride }: { ride: Ride }) => (
    <View 
      className="bg-white rounded-xl p-4 mb-4 border border-gray-100"
      style={{
        elevation: Platform.OS === "android" ? 4 : 0,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      }}
    >
      <View className={`flex-row justify-between items-start ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
        <View className={`flex-1 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
          <Text className={`text-lg mb-2 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
            {ride.origin_address || (language === 'ar' ? 'نقطة البداية غير معروفة' : 'Unknown origin')} → {ride.destination_address || (language === 'ar' ? 'نقطة الوصول غير معروفة' : 'Unknown destination')}
          </Text>
          <View className={`flex-row items-center mb-2 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <MaterialCommunityIcons name="account" size={16} color="#6B7280" />
            <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoRegular mr-2 text-right' : 'font-JakartaRegular ml-2 text-left'}`}>
              {language === 'ar' ? 'السائق: ' : 'Driver: '}{ride.driver?.name || (language === 'ar' ? 'غير محدد' : 'Not assigned')}
            </Text>
          </View>
          <View className={`flex-row items-center mb-2 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <MaterialCommunityIcons name="car" size={16} color="#6B7280" />
            <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoRegular mr-2 text-right' : 'font-JakartaRegular ml-2 text-left'}`}>
              {language === 'ar' ? 'المقاعد المتاحة: ' : 'Available Seats: '}{ride.available_seats}
            </Text>
          </View>
          <View className={`flex-row items-center justify-between ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <View className={`px-2 py-1 rounded-full ${getStatusColor(ride.status)}`}>
              <Text className={`text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                {getStatusText(ride.status)}
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => router.push({
            pathname: '/(root)/admin/rideDetails',
            params: { rideId: ride.id }
          } as any)}
          className="bg-gray-100 p-2 rounded-full"
        >
          <MaterialCommunityIcons 
            name={language === 'ar' ? 'chevron-left' : 'chevron-right'} 
            size={24} 
            color="#6B7280" 
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <Header 
          showProfileImage={false} 
          showSideMenu={false} 
          title={language === 'ar' ? 'إدارة الرحلات' : 'Rides Management'} 
        />
        <ScrollView className="flex-1 px-4">
          <View className="py-4">
            {/* Search and Filter Skeleton */}
            <View className="mb-6">
              <View className="h-14 bg-gray-200 rounded-xl mb-4" />
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                className="mb-4"
                contentContainerStyle={{ flexDirection: language === 'ar' ? 'row-reverse' : 'row' }}
              >
                <View className={`flex-row ${language === 'ar' ? 'space-x-reverse space-x-2' : 'space-x-2'}`}>
                  {[1, 2, 3, 4, 5].map((_, index) => (
                    <View key={index} className="h-10 w-24 bg-gray-200 rounded-full" />
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Rides List Skeleton */}
            <View>
              <SkeletonRideCard language={language} />
              <SkeletonRideCard language={language} />
              <SkeletonRideCard language={language} />
              <SkeletonRideCard language={language} />
              <SkeletonRideCard language={language} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <Header 
        showProfileImage={false} 
        showSideMenu={false} 
        title={language === 'ar' ? 'إدارة الرحلات' : 'Rides Management'} 
      />
      
      <ScrollView className="flex-1 px-4">
        <View className="py-4">
          {/* Search and Filter */}
          <View className="mb-6">
            <TextInput
              className={`bg-white rounded-xl p-4 mb-4 shadow-sm ${language === 'ar' ? 'text-right font-CairoRegular' : 'text-left font-JakartaRegular'}`}
              placeholder={language === 'ar' ? 'البحث في الرحلات...' : 'Search rides...'}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              className="mb-4"
              contentContainerStyle={{ flexDirection: language === 'ar' ? 'row-reverse' : 'row' }}
            >
              <View className={`flex-row ${language === 'ar' ? 'space-x-reverse space-x-2' : 'space-x-2'}`}>
                <TouchableOpacity
                  onPress={() => setFilter('all')}
                  className={`py-2 px-4 rounded-full ${filter === 'all' ? 'bg-blue-500' : 'bg-gray-200'}`}
                >
                  <Text className={`text-center ${filter === 'all' ? 'text-white' : 'text-gray-600'} ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                    {language === 'ar' ? 'الكل' : 'All'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setFilter('available')}
                  className={`py-2 px-4 rounded-full ${filter === 'available' ? 'bg-green-500' : 'bg-gray-200'}`}
                >
                  <Text className={`text-center ${filter === 'available' ? 'text-white' : 'text-gray-600'} ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                    {language === 'ar' ? 'متاح' : 'Available'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setFilter('full')}
                  className={`py-2 px-4 rounded-full ${filter === 'full' ? 'bg-purple-500' : 'bg-gray-200'}`}
                >
                  <Text className={`text-center ${filter === 'full' ? 'text-white' : 'text-gray-600'} ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                    {language === 'ar' ? 'ممتلئة' : 'Full'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setFilter('in-progress')}
                  className={`py-2 px-4 rounded-full ${filter === 'in-progress' ? 'bg-yellow-500' : 'bg-gray-200'}`}
                >
                  <Text className={`text-center ${filter === 'in-progress' ? 'text-white' : 'text-gray-600'} ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                    {language === 'ar' ? 'قيد التنفيذ' : 'In Progress'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setFilter('completed')}
                  className={`py-2 px-4 rounded-full ${filter === 'completed' ? 'bg-blue-500' : 'bg-gray-200'}`}
                >
                  <Text className={`text-center ${filter === 'completed' ? 'text-white' : 'text-gray-600'} ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                    {language === 'ar' ? 'مكتملة' : 'Completed'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>

          {/* Rides List */}
          <View>
            {filteredRides.length === 0 ? (
              <View className="items-center justify-center py-8">
                <Text className={`text-gray-500 text-lg ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                  {language === 'ar' ? 'لا توجد رحلات' : 'No rides found'}
                </Text>
              </View>
            ) : (
              filteredRides.map(ride => (
                <RideCard key={ride.id} ride={ride} />
              ))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default RidesManagement;