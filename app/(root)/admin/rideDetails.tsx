import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot, getDoc, Timestamp } from 'firebase/firestore';
import { useUser } from '@clerk/clerk-expo';
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '@/context/LanguageContext';
import { format, parse } from 'date-fns';

// Add date format constants
const DATE_FORMAT = 'dd/MM/yyyy HH:mm';
const TIME_FORMAT = 'HH:mm';
const DISPLAY_DATE_FORMAT = 'dd/MM/yyyy';

interface RideDetails {
  id: string;
  driverId: string;
  passengerId: string;
  status: 'available' | 'in-progress' | 'completed' | 'cancelled';
  origin_address: string;
  destination_address: string;
  origin_latitude?: number;
  origin_longitude?: number;
  destination_latitude?: number;
  destination_longitude?: number;
  ride_datetime: string;
  available_seats: number;
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
  rating?: number;
  feedback?: string;
  driver?: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email: string;
    car_seats?: number;
    car_type?: string;
    profile_image_url?: string;
    car_image_url?: string;
  };
  passenger?: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    email: string;
  };
}

const SkeletonStatusActions = ({ language }: { language: string }) => (
  <View className="bg-white rounded-xl p-4 shadow-sm">
    <View className={`h-7 w-32 bg-gray-200 rounded mb-4 ${language === 'ar' ? 'self-end' : 'self-start'}`} />
    <View className="flex-row flex-wrap gap-1.5">
      {[1, 2, 3, 4].map((_, index) => (
        <View key={index} className="flex-1 min-w-[90px] h-10 bg-gray-200 rounded-lg" />
      ))}
    </View>
  </View>
);

const SkeletonRouteInfo = ({ language }: { language: string }) => (
  <View className="bg-white rounded-xl p-4 shadow-sm">
    <View className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
      <View className="w-6 h-6 bg-gray-200 rounded-full" />
      <View className={`h-7 w-40 bg-gray-200 rounded ${language === 'ar' ? 'mr-2' : 'ml-2'}`} />
    </View>
    <View className="space-y-4">
      {[1, 2, 3, 4, 5].map((_, index) => (
        <View key={index} className={`flex-row items-start ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
          <View className="w-8 h-8 bg-gray-200 rounded-full" />
          <View className="flex-1">
            <View className={`h-4 w-24 bg-gray-200 rounded mb-1 ${language === 'ar' ? 'self-end' : 'self-start'}`} />
            <View className={`h-6 w-48 bg-gray-200 rounded ${language === 'ar' ? 'self-end' : 'self-start'}`} />
          </View>
        </View>
      ))}
    </View>
  </View>
);

const SkeletonDriverInfo = ({ language }: { language: string }) => (
  <View className="bg-white rounded-xl p-4 shadow-sm">
    <View className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
      <View className="w-6 h-6 bg-gray-200 rounded-full" />
      <View className={`h-7 w-40 bg-gray-200 rounded ${language === 'ar' ? 'mr-2' : 'ml-2'}`} />
    </View>
    <View className="space-y-4">
      <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
        <View className="w-16 h-16 bg-gray-200 rounded-full" />
        <View className="flex-1">
          <View className={`h-6 w-32 bg-gray-200 rounded mb-1 ${language === 'ar' ? 'self-end' : 'self-start'}`} />
          <View className={`h-4 w-24 bg-gray-200 rounded ${language === 'ar' ? 'self-end' : 'self-start'}`} />
        </View>
      </View>
      {[1, 2, 3].map((_, index) => (
        <View key={index} className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
          <View className="w-8 h-8 bg-gray-200 rounded-full" />
          <View className="flex-1">
            <View className={`h-4 w-20 bg-gray-200 rounded mb-1 ${language === 'ar' ? 'self-end' : 'self-start'}`} />
            <View className={`h-6 w-32 bg-gray-200 rounded ${language === 'ar' ? 'self-end' : 'self-start'}`} />
          </View>
        </View>
      ))}
      <View className="h-40 w-full bg-gray-200 rounded-lg" />
    </View>
  </View>
);

const SkeletonPassengerInfo = ({ language }: { language: string }) => (
  <View className="bg-white rounded-xl p-4 shadow-sm">
    <View className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
      <View className="w-6 h-6 bg-gray-200 rounded-full" />
      <View className={`h-7 w-40 bg-gray-200 rounded ${language === 'ar' ? 'mr-2' : 'ml-2'}`} />
    </View>
    <View className="space-y-4">
      {[1, 2, 3].map((_, index) => (
        <View key={index} className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
          <View className="w-8 h-8 bg-gray-200 rounded-full" />
          <View className="flex-1">
            <View className={`h-4 w-20 bg-gray-200 rounded mb-1 ${language === 'ar' ? 'self-end' : 'self-start'}`} />
            <View className={`h-6 w-32 bg-gray-200 rounded ${language === 'ar' ? 'self-end' : 'self-start'}`} />
          </View>
        </View>
      ))}
    </View>
  </View>
);

const SkeletonRatingInfo = ({ language }: { language: string }) => (
  <View className="bg-white rounded-xl p-4 shadow-sm mb-4">
    <View className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
      <View className="w-6 h-6 bg-gray-200 rounded-full" />
      <View className={`h-7 w-40 bg-gray-200 rounded ${language === 'ar' ? 'mr-2' : 'ml-2'}`} />
    </View>
    <View className="space-y-4">
      <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
        <View className="w-8 h-8 bg-gray-200 rounded-full" />
        <View className="flex-1">
          <View className={`h-4 w-20 bg-gray-200 rounded mb-1 ${language === 'ar' ? 'self-end' : 'self-start'}`} />
          <View className={`h-6 w-16 bg-gray-200 rounded ${language === 'ar' ? 'self-end' : 'self-start'}`} />
        </View>
      </View>
      <View className={`flex-row items-start ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
        <View className="w-8 h-8 bg-gray-200 rounded-full" />
        <View className="flex-1">
          <View className={`h-4 w-20 bg-gray-200 rounded mb-1 ${language === 'ar' ? 'self-end' : 'self-start'}`} />
          <View className={`h-20 w-full bg-gray-200 rounded ${language === 'ar' ? 'self-end' : 'self-start'}`} />
        </View>
      </View>
    </View>
  </View>
);

const RideDetails = () => {
  const { user } = useUser();
  const { language } = useLanguage();
  const { rideId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [rideDetails, setRideDetails] = useState<RideDetails | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');

  const formatDateTime = (dateString: string | Timestamp) => {
    try {
      // Handle empty or invalid input
      if (!dateString) {
        return 'Not specified';
      }

      // Handle Firestore Timestamp
      if (dateString instanceof Timestamp) {
        return format(dateString.toDate(), DATE_FORMAT);
      }

      // Try parsing the date string
      const parsedDate = parse(dateString as string, DATE_FORMAT, new Date());
      if (!isNaN(parsedDate.getTime())) {
        return format(parsedDate, DATE_FORMAT);
      }

      // If parsing fails, try direct date parsing
      const date = new Date(dateString as string);
      if (!isNaN(date.getTime())) {
        return format(date, DATE_FORMAT);
      }

      return 'Invalid date';
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid date';
    }
  };

  // Add formatTimeTo12Hour function
  const formatTimeTo12Hour = (timeStr: string | Timestamp) => {
    try {
      if (!timeStr) return { date: 'Not specified', time: 'Not specified' };

      // Handle Firestore Timestamp
      if (timeStr instanceof Timestamp) {
        const date = timeStr.toDate();
        return {
          date: format(date, DISPLAY_DATE_FORMAT),
          time: format(date, TIME_FORMAT)
        };
      }

      // Try parsing the date string
      const parsedDate = parse(timeStr as string, DATE_FORMAT, new Date());
      if (!isNaN(parsedDate.getTime())) {
        return {
          date: format(parsedDate, DISPLAY_DATE_FORMAT),
          time: format(parsedDate, TIME_FORMAT)
        };
      }

      // If parsing fails, try direct date parsing
      const date = new Date(timeStr as string);
      if (!isNaN(date.getTime())) {
        return {
          date: format(date, DISPLAY_DATE_FORMAT),
          time: format(date, TIME_FORMAT)
        };
      }

      return { date: 'Invalid date', time: 'Invalid time' };
    } catch (error) {
      console.error('Error formatting time:', error);
      return { date: 'Invalid date', time: 'Invalid time' };
    }
  };

  useEffect(() => {
    const fetchRideDetails = async () => {
      try {
        const rideRef = doc(db, 'rides', rideId as string);
        const rideSnap = await getDoc(rideRef);
        
        if (!rideSnap.exists()) {
          Alert.alert('Error', 'Ride not found');
          router.back();
          return;
        }

        const rideData = rideSnap.data();
        
        // Format the ride datetime
        let formattedDateTime = rideData.ride_datetime;
        if (rideData.ride_datetime instanceof Timestamp) {
          formattedDateTime = format(rideData.ride_datetime.toDate(), DATE_FORMAT);
        } else {
          try {
            const parsedDate = parse(rideData.ride_datetime, DATE_FORMAT, new Date());
            if (!isNaN(parsedDate.getTime())) {
              formattedDateTime = format(parsedDate, DATE_FORMAT);
            }
          } catch {
            console.warn('Invalid ride_datetime format');
          }
        }

        // Fetch driver details
        let driverInfo = null;
        if (rideData.driver_id) {
          const driverRef = doc(db, 'users', rideData.driver_id);
          const driverSnap = await getDoc(driverRef);
          if (driverSnap.exists()) {
            const driverData = driverSnap.data();
            driverInfo = {
              firstName: driverData.firstName || '',
              lastName: driverData.lastName || '',
              phoneNumber: driverData.phoneNumber || driverData.phone || '',
              email: driverData.email || '',
              car_seats: driverData.driver?.car_seats || 4,
              car_type: driverData.driver?.car_type || 'Unknown',
              profile_image_url: driverData.driver?.profile_image_url || 'https://via.placeholder.com/40',
              car_image_url: driverData.driver?.car_image_url || 'https://via.placeholder.com/120x80'
            };
          }
        }

        const ride = { 
          id: rideSnap.id,
          ...rideData,
          status: rideData.status || 'pending',
          createdAt: rideData.createdAt || new Date().toISOString(),
          ride_datetime: formattedDateTime,
          available_seats: rideData.available_seats || 0,
          driver: driverInfo
        } as RideDetails;

        // Log the processed ride data
        console.log('Processed ride data:', ride);

        // Fetch passenger details
        if (ride.passengerId) {
          const passengerRef = doc(db, 'users', ride.passengerId);
          const passengerSnap = await getDoc(passengerRef);
          if (passengerSnap.exists()) {
            const passengerData = passengerSnap.data();
            ride.passenger = {
              firstName: passengerData.firstName || '',
              lastName: passengerData.lastName || '',
              phoneNumber: passengerData.phoneNumber || '',
              email: passengerData.email || ''
            };
          }
        }

        setRideDetails(ride);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching ride details:', error);
        Alert.alert('Error', 'Failed to fetch ride details');
        setLoading(false);
      }
    };

    fetchRideDetails();
  }, [rideId]);

  const handleStatusChange = async (newStatus: RideDetails['status']) => {
    if (!rideDetails) return;

    // Show confirmation dialog
    Alert.alert(
      language === 'ar' ? 'تأكيد تغيير الحالة' : 'Confirm Status Change',
      language === 'ar' ? `هل أنت متأكد أنك تريد تغيير حالة الرحلة إلى ${newStatus === 'available' ? 'متاح' : newStatus === 'in-progress' ? 'قيد التنفيذ' : newStatus === 'completed' ? 'مكتمل' : newStatus === 'cancelled' ? 'ملغي' : newStatus}؟` : `Are you sure you want to change the ride status to ${newStatus}?`,
      [
        {
          text: language === 'ar' ? 'إلغاء' : 'Cancel',
          style: 'cancel'
        },
        {
          text: language === 'ar' ? 'تأكيد' : 'Confirm',
          onPress: async () => {
            try {
              const rideRef = doc(db, 'rides', rideDetails.id);
              const updateData: any = { status: newStatus };
              
              if (newStatus === 'completed') {
                updateData.completedAt = new Date().toISOString();
              } else if (newStatus === 'cancelled') {
                updateData.cancelledAt = new Date().toISOString();
              }

              await updateDoc(rideRef, updateData);
              Alert.alert('Success', 'Ride status updated successfully');
            } catch (error) {
              console.error('Error updating ride status:', error);
              Alert.alert('Error', 'Failed to update ride status');
            }
          }
        }
      ]
    );
  };

  const getStatusColor = (status: RideDetails['status']) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-700';
      case 'in-progress':
        return 'bg-blue-100 text-blue-700';
      case 'completed':
        return 'bg-purple-100 text-purple-700';
      case 'cancelled':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <ScrollView className="flex-1">
          {/* Header with Gradient Background */}
          <View className="bg-orange-500 px-4 pt-4 pb-6">
            <View className="flex-row items-center justify-between mb-4">
              <View className="w-10 h-10 bg-white/20 rounded-full" />
              <View className={`h-8 w-32 bg-white/20 rounded ${language === 'ar' ? 'self-end' : 'self-start'}`} />
              <View className="w-10" />
            </View>
            <View className={`h-8 w-24 bg-white/20 rounded-full ${language === 'ar' ? 'self-end' : 'self-start'}`} />
          </View>

          <View className="px-4 -mt-4">
            <View className="space-y-4">
              <SkeletonStatusActions language={language} />
              <SkeletonRouteInfo language={language} />
              <SkeletonDriverInfo language={language} />
              <SkeletonPassengerInfo language={language} />
              <SkeletonRatingInfo language={language} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!rideDetails) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className={`text-gray-600 ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
          {language === 'ar' ? 'الرحلة غير موجودة' : 'Ride not found'}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1">
        {/* Header with Gradient Background */}
        <View className="bg-orange-500 px-4 pt-4 pb-6">
          <View className="flex-row items-center justify-between mb-4">
            <TouchableOpacity 
              onPress={() => router.back()}
              className="bg-white/20 p-2 rounded-full"
            >
              <MaterialCommunityIcons 
                name={language === 'ar' ? "arrow-right" : "arrow-left"} 
                size={24} 
                color="white" 
              />
            </TouchableOpacity>
            <Text className={`text-2xl ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-white`}>
              {language === 'ar' ? 'تفاصيل الرحلة' : 'Ride Details'}
            </Text>
            <View className="w-10" />
          </View>
          
          {/* Status Badge */}
          <View className="bg-white/20 rounded-full px-4 py-2 self-start">
            <Text className={`text-white ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} capitalize`}>
              {language === 'ar' ? (
                rideDetails?.status === 'available' ? 'متاح' :
                rideDetails?.status === 'in-progress' ? 'قيد التنفيذ' :
                rideDetails?.status === 'completed' ? 'مكتمل' :
                rideDetails?.status === 'cancelled' ? 'ملغي' :
                rideDetails?.status
              ) : (
                rideDetails?.status
              )}
            </Text>
          </View>
        </View>

        <View className="px-4 -mt-4">
          {/* Main Content */}
          <View className="space-y-4">
            {/* Status Actions Card */}
            <View className="bg-white rounded-xl p-4 shadow-sm">
              <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} mb-4 text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'تحديث الحالة' : 'Update Status'}
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                <TouchableOpacity 
                  onPress={() => handleStatusChange('available')}
                  className={`flex-1 min-w-[90px] py-2 px-3 rounded-lg ${rideDetails?.status === 'available' ? 'bg-green-500' : 'bg-gray-100'}`}
                >
                  <Text className={`text-center text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} ${rideDetails?.status === 'available' ? 'text-white' : 'text-gray-600'}`}>
                    {language === 'ar' ? 'متاح' : 'Available'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => handleStatusChange('in-progress')}
                  className={`flex-1 min-w-[90px] py-2 px-3 rounded-lg ${rideDetails?.status === 'in-progress' ? 'bg-blue-500' : 'bg-gray-100'}`}
                >
                  <Text className={`text-center text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} ${rideDetails?.status === 'in-progress' ? 'text-white' : 'text-gray-600'}`}>
                    {language === 'ar' ? 'قيد التنفيذ' : 'In Progress'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => handleStatusChange('completed')}
                  className={`flex-1 min-w-[90px] py-2 px-3 rounded-lg ${rideDetails?.status === 'completed' ? 'bg-purple-500' : 'bg-gray-100'}`}
                >
                  <Text className={`text-center text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} ${rideDetails?.status === 'completed' ? 'text-white' : 'text-gray-600'}`}>
                    {language === 'ar' ? 'مكتمل' : 'Complete'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => handleStatusChange('cancelled')}
                  className={`flex-1 min-w-[90px] py-2 px-3 rounded-lg ${rideDetails?.status === 'cancelled' ? 'bg-red-500' : 'bg-gray-100'}`}
                >
                  <Text className={`text-center text-sm ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'} ${rideDetails?.status === 'cancelled' ? 'text-white' : 'text-gray-600'}`}>
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Route Information Card */}
            <View className="bg-white rounded-xl p-4 shadow-sm">
              <View className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <MaterialCommunityIcons name="map-marker-path" size={24} color="#C2410C" />
                <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} ${language === 'ar' ? 'mr-2' : 'ml-2'} text-gray-800`}>
                  {language === 'ar' ? 'معلومات المسار' : 'Route Information'}
                </Text>
              </View>
              <View className="space-y-4">
                <View className={`flex-row items-start ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                  <View className="w-8 h-8 rounded-full bg-orange-50 items-center justify-center">
                    <MaterialCommunityIcons name="map-marker" size={20} color="#C2410C" />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                      {language === 'ar' ? 'موقع الانطلاق' : 'Pickup Location'}
                    </Text>
                    <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                      {rideDetails?.origin_address || (language === 'ar' ? 'غير محدد' : 'Not specified')}
                    </Text>
                  </View>
                </View>

                <View className={`flex-row items-start ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                  <View className="w-8 h-8 rounded-full bg-orange-50 items-center justify-center">
                    <MaterialCommunityIcons name="map-marker-check" size={20} color="#C2410C" />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                      {language === 'ar' ? 'موقع الوصول' : 'Drop-off Location'}
                    </Text>
                    <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                      {rideDetails?.destination_address || (language === 'ar' ? 'غير محدد' : 'Not specified')}
                    </Text>
                  </View>
                </View>

                <View className={`flex-row items-start ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                  <View className="w-8 h-8 rounded-full bg-orange-50 items-center justify-center">
                    <MaterialCommunityIcons name="clock-outline" size={20} color="#C2410C" />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                      {language === 'ar' ? 'وقت الرحلة' : 'Ride Time'}
                    </Text>
                    <View className="space-y-1">
                      <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <MaterialCommunityIcons name="calendar" size={16} color="#6B7280" className={language === 'ar' ? 'ml-1' : 'mr-1'} />
                        <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                          {formatTimeTo12Hour(rideDetails?.ride_datetime || '').date}
                        </Text>
                      </View>
                      <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <MaterialCommunityIcons name="clock-outline" size={16} color="#6B7280" className={language === 'ar' ? 'ml-1' : 'mr-1'} />
                        <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                          {formatTimeTo12Hour(rideDetails?.ride_datetime || '').time}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View className={`flex-row items-start ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                  <View className="w-8 h-8 rounded-full bg-orange-50 items-center justify-center">
                    <MaterialCommunityIcons name="car" size={20} color="#C2410C" />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                      {language === 'ar' ? 'المقاعد المتاحة' : 'Available Seats'}
                    </Text>
                    <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                      {rideDetails?.available_seats}
                    </Text>
                  </View>
                </View>

                <View className={`flex-row items-start ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                  <View className="w-8 h-8 rounded-full bg-orange-50 items-center justify-center">
                    <MaterialCommunityIcons name="calendar" size={20} color="#C2410C" />
                  </View>
                  <View className="flex-1">
                    <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                      {language === 'ar' ? 'تم الطلب في' : 'Requested At'}
                    </Text>
                    <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                      {formatDateTime(rideDetails?.createdAt || '')}
                    </Text>
                  </View>
                </View>

                {rideDetails?.completedAt && (
                  <View className={`flex-row items-start ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                    <View className="w-8 h-8 rounded-full bg-orange-50 items-center justify-center">
                      <MaterialCommunityIcons name="check-circle" size={20} color="#C2410C" />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                        {language === 'ar' ? 'تم الإكمال في' : 'Completed At'}
                      </Text>
                      <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                        {formatDateTime(rideDetails.completedAt)}
                      </Text>
                    </View>
                  </View>
                )}

                {rideDetails?.cancelledAt && (
                  <View className={`flex-row items-start ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                    <View className="w-8 h-8 rounded-full bg-orange-50 items-center justify-center">
                      <MaterialCommunityIcons name="close-circle" size={20} color="#C2410C" />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                        {language === 'ar' ? 'تم الإلغاء في' : 'Cancelled At'}
                      </Text>
                      <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                        {formatDateTime(rideDetails.cancelledAt)}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>

            {/* Driver Information Card */}
            {rideDetails?.driver && (
              <View className="bg-white rounded-xl p-4 shadow-sm">
                <View className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <MaterialCommunityIcons name="account-tie" size={24} color="#C2410C" />
                  <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} ${language === 'ar' ? 'mr-2' : 'ml-2'} text-gray-800`}>
                    {language === 'ar' ? 'معلومات السائق' : 'Driver Information'}
                  </Text>
                </View>
                <View className="space-y-4">
                  {/* Driver Profile Image and Name */}
                  <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <Image
                      source={{ uri: rideDetails.driver.profile_image_url }}
                      className={`w-16 h-16 rounded-full ${language === 'ar' ? 'ml-4' : 'mr-4'}`}
                    />
                    <View className="flex-1">
                      <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-gray-800`}>
                        {`${rideDetails.driver.firstName} ${rideDetails.driver.lastName}`}
                      </Text>
                      <Text className={`text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-600 mt-1`}>
                        {rideDetails.driver.car_type}
                      </Text>
                    </View>
                  </View>

                  {/* Car Information */}
                  <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                    <View className="w-8 h-8 rounded-full bg-orange-50 items-center justify-center">
                      <MaterialCommunityIcons name="car" size={20} color="#C2410C" />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                        {language === 'ar' ? 'تفاصيل السيارة' : 'Car Details'}
                      </Text>
                      <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                        {`${rideDetails.driver.car_type} (${language === 'ar' ? 'مقاعد' : 'seats'}: ${rideDetails.driver.car_seats})`}
                      </Text>
                    </View>
                  </View>

                  {/* Contact Information */}
                  <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                    <View className="w-8 h-8 rounded-full bg-orange-50 items-center justify-center">
                      <MaterialCommunityIcons name="phone" size={20} color="#C2410C" />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                        {language === 'ar' ? 'الهاتف' : 'Phone'}
                      </Text>
                      <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                        {rideDetails.driver?.phoneNumber || (language === 'ar' ? 'غير متوفر' : 'Not available')}
                      </Text>
                    </View>
                  </View>

                  <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                    <View className="w-8 h-8 rounded-full bg-orange-50 items-center justify-center">
                      <MaterialCommunityIcons name="email" size={20} color="#C2410C" />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                        {language === 'ar' ? 'البريد الإلكتروني' : 'Email'}
                      </Text>
                      <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                        {rideDetails.driver.email}
                      </Text>
                    </View>
                  </View>

                  {/* Car Image */}
                  {rideDetails.driver?.car_image_url && (
                    <TouchableOpacity 
                      onPress={() => {
                        if (rideDetails.driver?.car_image_url) {
                          setSelectedImage(rideDetails.driver.car_image_url);
                          setShowImageModal(true);
                        }
                      }}
                      className="mt-2"
                    >
                      <Image
                        source={{ uri: rideDetails.driver.car_image_url }}
                        className="w-full h-40 rounded-lg"
                        resizeMode="cover"
                      />
                      <Text className={`text-sm text-gray-500 mt-1 text-center ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                        {language === 'ar' ? 'انقر لعرض الصورة كاملة' : 'Tap to view full image'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            {/* Passenger Information Card */}
            {rideDetails?.passenger && (
              <View className="bg-white rounded-xl p-4 shadow-sm">
                <View className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <MaterialCommunityIcons name="account" size={24} color="#C2410C" />
                  <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} ${language === 'ar' ? 'mr-2' : 'ml-2'} text-gray-800`}>
                    {language === 'ar' ? 'معلومات الراكب' : 'Passenger Information'}
                  </Text>
                </View>
                <View className="space-y-4">
                  <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                    <View className="w-8 h-8 rounded-full bg-orange-100 items-center justify-center">
                      <MaterialCommunityIcons name="account" size={20} color="#C2410C" />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                        {language === 'ar' ? 'الاسم' : 'Name'}
                      </Text>
                      <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                        {`${rideDetails.passenger.firstName} ${rideDetails.passenger.lastName}`}
                      </Text>
                    </View>
                  </View>

                  <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                    <View className="w-8 h-8 rounded-full bg-orange-100 items-center justify-center">
                      <MaterialCommunityIcons name="phone" size={20} color="#C2410C" />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                        {language === 'ar' ? 'الهاتف' : 'Phone'}
                      </Text>
                      <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                        {rideDetails.passenger.phoneNumber}
                      </Text>
                    </View>
                  </View>

                  <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                    <View className="w-8 h-8 rounded-full bg-orange-100 items-center justify-center">
                      <MaterialCommunityIcons name="email" size={20} color="#C2410C" />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                        {language === 'ar' ? 'البريد الإلكتروني' : 'Email'}
                      </Text>
                      <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                        {rideDetails.passenger.email}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Rating and Feedback Card */}
            {rideDetails?.rating && (
              <View className="bg-white rounded-xl p-4 shadow-sm mb-4">
                <View className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <MaterialCommunityIcons name="star" size={24} color="#C2410C" />
                  <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} ${language === 'ar' ? 'mr-2' : 'ml-2'} text-gray-800`}>
                    {language === 'ar' ? 'التقييم والملاحظات' : 'Rating & Feedback'}
                  </Text>
                </View>
                <View className="space-y-4">
                  <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                    <View className="w-8 h-8 rounded-full bg-orange-100 items-center justify-center">
                      <MaterialCommunityIcons name="star" size={20} color="#C2410C" />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                        {language === 'ar' ? 'التقييم' : 'Rating'}
                      </Text>
                      <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                        {`${rideDetails.rating}/5`}
                      </Text>
                    </View>
                  </View>

                  {rideDetails.feedback && (
                    <View className={`flex-row items-start ${language === 'ar' ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                      <View className="w-8 h-8 rounded-full bg-orange-100 items-center justify-center">
                        <MaterialCommunityIcons name="message-text" size={20} color="#C2410C" />
                      </View>
                      <View className="flex-1">
                        <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                          {language === 'ar' ? 'الملاحظات' : 'Feedback'}
                        </Text>
                        <Text className={`text-base ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} text-gray-800`}>
                          {rideDetails.feedback}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Image Modal */}
      <Modal
        visible={showImageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setShowImageModal(false)}
        >
          <Image
            source={{ uri: selectedImage }}
            style={{ width: '90%', height: 200, resizeMode: 'contain', borderRadius: 10 }}
          />
          <Text className={`text-white mt-4 ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
            {language === 'ar' ? 'انقر في أي مكان للإغلاق' : 'Tap anywhere to close'}
          </Text>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
};

export default RideDetails; 