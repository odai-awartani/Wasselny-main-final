import { View, Text, Alert, ActivityIndicator, Image, ScrollView, TouchableOpacity } from 'react-native';
import React, { useEffect, useState, useRef } from 'react';
import RideLayout from '@/components/RideLayout';
import CustomButton from '@/components/CustomButton';
import { router, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@clerk/clerk-expo';
import { sendRideStatusNotification, schedulePassengerRideReminder, scheduleRideNotification } from '@/lib/notifications';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { SafeAreaView } from 'react-native-safe-area-context';
import Header from '@/components/Header';
import { useLanguage } from '@/context/LanguageContext';

interface UserData {
  name?: string;
  profile_image_url?: string;
  [key: string]: any;
}

interface RideRequest {
  id: string;
  user_id: string;
  status: 'waiting' | 'accepted' | 'rejected' | 'checked_in' | 'checked_out' | 'cancelled';
  created_at: any;
  passenger_name?: string;
  profile_image_url?: string;
  selected_waypoint?: {
    latitude: number;
    longitude: number;
    address: string;
    street?: string;
  } | null;
  requested_seats?: number;
}

const DEFAULT_DRIVER_NAME = 'Unknown Driver';

const RideRequests = () => {
  const params = useLocalSearchParams();
  const { userId } = useAuth();
  const { language, t } = useLanguage();
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [currentPassengers, setCurrentPassengers] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Fetch both pending requests and current passengers
  useEffect(() => {
    const fetchAllRequests = async () => {
      try {
        setLoading(true);
        const rideRequestsRef = collection(db, 'ride_requests');
        
        // Fetch pending requests
        const pendingQuery = query(
          rideRequestsRef,
          where('ride_id', '==', params.rideId),
          where('status', '==', 'waiting')
        );
        
        // Fetch current passengers
        const currentPassengersQuery = query(
          rideRequestsRef,
          where('ride_id', '==', params.rideId),
          where('status', 'in', ['accepted', 'checked_in'])
        );
        
        const [pendingSnapshot, currentPassengersSnapshot] = await Promise.all([
          getDocs(pendingQuery),
          getDocs(currentPassengersQuery)
        ]);
        
        const requestsData: RideRequest[] = [];
        const currentPassengersData: RideRequest[] = [];
        
        // Process pending requests
        for (const requestDoc of pendingSnapshot.docs) {
          const requestData = requestDoc.data();
          const userDoc = await getDoc(doc(db, 'users', requestData.user_id));
          const userData = userDoc.data() as UserData;
          const userName = userData?.name || t.passenger;
          const userImage = userData?.profile_image_url;
          
          requestsData.push({
            id: requestDoc.id,
            user_id: requestData.user_id,
            status: requestData.status,
            created_at: requestData.created_at,
            passenger_name: userName,
            profile_image_url: userImage,
            selected_waypoint: requestData.selected_waypoint || null,
            requested_seats: requestData.requested_seats || 1
          });
        }
        
        // Process current passengers
        for (const passengerDoc of currentPassengersSnapshot.docs) {
          const passengerData = passengerDoc.data();
          const userDoc = await getDoc(doc(db, 'users', passengerData.user_id));
          const userData = userDoc.data() as UserData;
          const userName = userData?.name || t.passenger;
          const userImage = userData?.profile_image_url;
          
          currentPassengersData.push({
            id: passengerDoc.id,
            user_id: passengerData.user_id,
            status: passengerData.status,
            created_at: passengerData.created_at,
            passenger_name: userName,
            profile_image_url: userImage,
            selected_waypoint: passengerData.selected_waypoint || null,
            requested_seats: passengerData.requested_seats || 1
          });
        }
        
        setRequests(requestsData);
        setCurrentPassengers(currentPassengersData);
      } catch (err) {
        console.error('Error fetching requests:', err);
        setError('فشل تحميل طلبات الحجز');
      } finally {
        setLoading(false);
      }
    };

    fetchAllRequests();
  }, [params.rideId, t.passenger]);

  const handleAcceptRequest = async (requestId: string, userId: string) => {
    try {
      if (Platform.OS === 'android') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const userDoc = await getDoc(doc(db, 'users', userId));
      const passengerName = userDoc.data()?.name || t.passenger;

      if (!params.rideId || !params.driverId) {
        throw new Error(t.rideOrDriverDataMissing);
      }

      // Get the ride details to check available seats
      const rideDoc = await getDoc(doc(db, 'rides', params.rideId as string));
      const rideData = rideDoc.data();
      const availableSeats = rideData?.available_seats || 0;

      // Get the request details to check requested seats
      const requestDoc = await getDoc(doc(db, 'ride_requests', requestId));
      const requestData = requestDoc.data();
      const requestedSeats = requestData?.requested_seats || 1;

      // Check if accepting this request would exceed available seats
      if (requestedSeats > availableSeats) {
        Alert.alert(
          t.insufficientSeats,
          `${t.onlyAvailableSeats} ${availableSeats} ${availableSeats === 1 ? t.seat : t.seats}`
        );
        return;
      }

      const passengerNotificationId = await scheduleRideNotification(params.rideId as string, userId, false);
      const driverNotificationId = await scheduleRideNotification(params.rideId as string, params.driverId as string, true);

      // Update the ride's available seats
      await updateDoc(doc(db, 'rides', params.rideId as string), {
        available_seats: availableSeats - requestedSeats,
        updated_at: serverTimestamp(),
      });

      await updateDoc(doc(db, 'ride_requests', requestId), {
        status: 'accepted',
        updated_at: serverTimestamp(),
        passenger_name: passengerName,
        passenger_id: userId,
        notification_id: passengerNotificationId || null,
      });

      await sendRideStatusNotification(
        userId,
        t.bookingAccepted,
        `${t.bookingAcceptedForRide} ${params.origin} ${t.to} ${params.destination}`,
        params.rideId as string
      );

      setRequests(prevRequests => prevRequests.filter(request => request.id !== requestId));

      Alert.alert(t.bookingAcceptedSuccess, `${t.bookingAcceptedFor} ${passengerName}`);
    } catch (error) {
      console.error('Error accepting request:', error);
      Alert.alert(t.errorAcceptingRequest);
    }
  };

  const handleRejectRequest = async (requestId: string, userId: string) => {
    try {
      if (Platform.OS === 'android') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const userDoc = await getDoc(doc(db, 'users', userId));
      const passengerName = userDoc.data()?.name || t.passenger;

      await updateDoc(doc(db, 'ride_requests', requestId), {
        status: 'rejected',
        updated_at: serverTimestamp(),
      });

      await sendRideStatusNotification(
        userId,
        t.bookingRejected,
        `${t.bookingRejectedForRide} ${params.origin} ${t.to} ${params.destination}`,
        params.rideId as string
      );

      setRequests(prevRequests => prevRequests.filter(request => request.id !== requestId));

      Alert.alert(t.bookingRejectedSuccess, `${t.bookingRejectedFor} ${passengerName}`);
    } catch (error) {
      console.error('Error rejecting request:', error);
      Alert.alert(t.errorRejectingRequest);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#f97316" />
        <Text className="mt-4 text-black font-CairoMedium">{t.loadingBookingRequests}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 justify-center items-center p-4 bg-white">
        <MaterialIcons name="error-outline" size={48} color="#f97316" />
        <Text className="mt-4 text-black text-center font-CairoMedium">{error}</Text>
        <CustomButton
          title={t.retry}
          onPress={() => router.back()}
          className="mt-4 bg-orange-500 py-3 px-6 rounded-xl"
        />
      </View>
    );
  }

  const renderPassengerCard = (item: RideRequest, isCurrentPassenger: boolean = false) => (
    <View 
      key={item.id} 
      className="bg-white mb-4 rounded-2xl overflow-hidden"
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
      }}
    >
      <View className="p-4">
        <TouchableOpacity 
          onPress={() => router.push({
            pathname: '/profile/[id]',
            params: { id: item.user_id }
          })}
          className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}
        >
          <View className={`w-14 h-14 rounded-full bg-gray-100 items-center justify-center overflow-hidden border-2 border-orange-100 ${language === 'ar' ? 'mr-3' : 'ml-3'}`}>
            {item.profile_image_url ? (
              <Image
                source={{ uri: item.profile_image_url }}
                className="w-full h-full"
              />
            ) : (
              <MaterialIcons name="person" size={28} color="#f97316" />
            )}
          </View>
          <View className="flex-1">
            <Text className="text-xl font-CairoBold text-gray-800 mb-1">
              {item.passenger_name}
            </Text>
            <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <MaterialIcons name="access-time" style={{marginBottom: 4}} size={16} color="#6B7280" />
              <Text className={`text-sm text-gray-500 font-CairoRegular ${language === 'ar' ? 'mr-1' : 'ml-1'}`}>
                {item.created_at ? new Date(item.created_at.toDate()).toLocaleTimeString() : t.unspecified}
              </Text>
            </View>
          </View>
          <MaterialIcons 
            name={language === 'ar' ? "chevron-left" : "chevron-right"} 
            size={24} 
            color="#6B7280" 
          />
        </TouchableOpacity>

        {item.selected_waypoint && (
          <View className="bg-orange-50 rounded-xl p-3 mb-4">
            <View className={`flex-row justify-start items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <MaterialIcons name="location-on" size={20} color="#f97316" />
              <Text className={`text-base text-gray-700 font-CairoBold ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
                {t.stopPoint}:
              </Text>
              <Text className={`text-sm text-gray-600 font-CairoRegular ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
                {item.selected_waypoint.address === params.origin ? (
                  t.startingPoint
                ) : (
                  item.selected_waypoint.address
                )}
              </Text>
            </View>
          </View>
        )}

        <View className="bg-blue-50 rounded-xl p-3 mb-4">
          <View className={`flex-row justify-start items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <MaterialIcons name="event-seat" size={20} color="#2563EB" />
            <Text className={`text-base text-gray-700 font-CairoBold ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
              {t.requestedSeats}:
            </Text>
            <Text className={`text-sm text-gray-600 font-CairoRegular ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
              {item.requested_seats || 1} {item.requested_seats === 1 ? t.seat : t.seats}
            </Text>
          </View>
        </View>

        {!isCurrentPassenger && (
          <View className="flex-row justify-between mt-2">
            <CustomButton
              title={t.accept}
              onPress={() => handleAcceptRequest(item.id, item.user_id)}
              className="bg-green-500 w-28 px-6 rounded-xl"
            />
            <CustomButton
              title={t.reject}
              onPress={() => handleRejectRequest(item.id, item.user_id)}
              className="bg-red-500 w-28 px-6 rounded-xl"
            />
          </View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView>
      <Header title={t.bookingRequests} showProfileImage={false} showSideMenu={false} />

      <ScrollView 
        ref={scrollViewRef}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={true}
      >
        <View className="flex-1 p-3">
          {/* Current Passengers Section */}
          {currentPassengers.length > 0 && (
            <View className="mb-6">
              <Text className={`text-xl font-CairoBold text-gray-800 mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'الركاب الحاليين' : 'Current Passengers'}
              </Text>
              {currentPassengers.map(item => renderPassengerCard(item, true))}
            </View>
          )}

          {/* Pending Requests Section */}
          <View>
            <Text className={`text-xl font-CairoBold text-gray-800 mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {language === 'ar' ? 'طلبات الحجز المعلقة' : 'Pending Requests'}
            </Text>
            {requests.length === 0 ? (
              <View className="flex-1 justify-center items-center p-4">
                <MaterialIcons name="event-busy" size={48} color="#9CA3AF" />
                <Text className="mt-4 text-gray-500 text-center font-CairoMedium">
                  {t.noPendingRequests}
                </Text>
              </View>
            ) : (
              requests.map(item => renderPassengerCard(item))
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default RideRequests; 