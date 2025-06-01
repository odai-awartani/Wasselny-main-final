import { View, Text, Alert, ActivityIndicator, Image, ScrollView, TouchableOpacity, Animated, Modal } from 'react-native';
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
import { LinearGradient } from 'expo-linear-gradient';

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

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
}

type IconName = 'check-circle' | 'error' | 'warning' | 'info';

const CustomAlert = ({ 
  visible, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmText = 'نعم', 
  cancelText = 'لا',
  type = 'info'
}: CustomAlertProps) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 7
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true
        })
      ]).start();
    }
  }, [visible]);

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          icon: 'check-circle' as IconName,
          color: '#22c55e',
          bgColor: '#dcfce7'
        };
      case 'error':
        return {
          icon: 'error' as IconName,
          color: '#ef4444',
          bgColor: '#fee2e2'
        };
      case 'warning':
        return {
          icon: 'warning' as IconName,
          color: '#f97316',
          bgColor: '#ffedd5'
        };
      default:
        return {
          icon: 'info' as IconName,
          color: '#3b82f6',
          bgColor: '#dbeafe'
        };
    }
  };

  const typeStyles = getTypeStyles();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
    >
      <View className="flex-1 justify-center items-center bg-black/50">
        <Animated.View 
          className="w-[85%] bg-white rounded-2xl overflow-hidden"
          style={{
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim
          }}
        >
          <View className={`p-6 ${typeStyles.bgColor}`}>
            <View className="items-center mb-4">
              <MaterialIcons name={typeStyles.icon} size={48} color={typeStyles.color} />
            </View>
            <Text className="text-xl font-CairoBold text-gray-800 text-center mb-2">
              {title}
            </Text>
            <Text className="text-base text-gray-600 text-center font-CairoRegular">
              {message}
            </Text>
          </View>
          
          <View className="flex-row border-t border-gray-200">
            {onCancel && (
              <TouchableOpacity
                onPress={onCancel}
                className="flex-1 py-4 border-r border-gray-200"
              >
                <Text className="text-base text-gray-600 text-center font-CairoMedium">
                  {cancelText}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={onConfirm}
              className={`py-4 ${onCancel ? 'flex-1' : 'w-full'}`}
              style={{ backgroundColor: typeStyles.color }}
            >
              <Text className="text-base text-white text-center font-CairoMedium">
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const SkeletonLoading = () => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const renderSkeletonCard = (isCurrentPassenger: boolean = false, index: number) => (
    <View 
      key={`skeleton-${isCurrentPassenger ? 'current' : 'pending'}-${index}`}
      className={`bg-white mb-4 rounded-2xl overflow-hidden ${isCurrentPassenger ? 'p-3' : 'p-4'}`}
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 5,
      }}
    >
      <View className={`${isCurrentPassenger ? 'p-2' : 'p-4'}`}>
        <View className={`flex-row items-center ${isCurrentPassenger ? 'mb-2' : 'mb-4'}`}>
          <Animated.View 
            className={`${isCurrentPassenger ? 'w-12 h-12' : 'w-16 h-16'} rounded-full bg-gray-200`}
            style={{
              opacity: shimmerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.7],
              }),
            }}
          />
          <View className="flex-1 ml-4">
            <Animated.View 
              className="h-6 bg-gray-200 rounded-md mb-2 w-3/4"
              style={{
                opacity: shimmerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 0.7],
                }),
              }}
            />
            <Animated.View 
              className="h-4 bg-gray-200 rounded-md w-1/2"
              style={{
                opacity: shimmerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 0.7],
                }),
              }}
            />
          </View>
        </View>

        <Animated.View 
          className={`bg-gray-200 rounded-xl ${isCurrentPassenger ? 'p-2 mb-2' : 'p-4 mb-4'} h-12`}
          style={{
            opacity: shimmerAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.3, 0.7],
            }),
          }}
        />

        <Animated.View 
          className={`bg-gray-200 rounded-xl ${isCurrentPassenger ? 'p-2 mb-2' : 'p-4 mb-4'} h-12`}
          style={{
            opacity: shimmerAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.3, 0.7],
            }),
          }}
        />

        {!isCurrentPassenger && (
          <View className="flex-row justify-between mt-2 space-x-3">
            <Animated.View 
              className="flex-1 h-12 bg-gray-200 rounded-xl"
              style={{
                opacity: shimmerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 0.7],
                }),
              }}
            />
            <Animated.View 
              className="flex-1 h-12 bg-gray-200 rounded-xl"
              style={{
                opacity: shimmerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 0.7],
                }),
              }}
            />
          </View>
        )}

        {isCurrentPassenger && (
          <Animated.View 
            className="h-12 bg-gray-200 rounded-xl mt-2"
            style={{
              opacity: shimmerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.7],
              }),
            }}
          />
        )}
      </View>
    </View>
  );

  return (
    <ScrollView className="flex-1 p-4">
      {/* Current Passengers Section Skeleton */}
      <View className="mb-6">
        <View className="flex-row items-center mb-4">
          <View className="w-6 h-6 bg-gray-200 rounded-full mr-2" />
          <Animated.View 
            className="h-6 bg-gray-200 rounded-md w-48"
            style={{
              opacity: shimmerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.7],
              }),
            }}
          />
        </View>
        {[1, 2].map((_, index) => renderSkeletonCard(true, index))}
      </View>

      {/* Pending Requests Section Skeleton */}
      <View>
        <View className="flex-row items-center mb-4">
          <View className="w-6 h-6 bg-gray-200 rounded-full mr-2" />
          <Animated.View 
            className="h-6 bg-gray-200 rounded-md w-48"
            style={{
              opacity: shimmerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 0.7],
              }),
            }}
          />
        </View>
        {[1, 2, 3].map((_, index) => renderSkeletonCard(false, index))}
      </View>
    </ScrollView>
  );
};

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
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {},
  });

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

  const showAlert = (config: typeof alertConfig) => {
    setAlertConfig({
      ...config,
      confirmText: config.confirmText || t.yes,
      cancelText: config.cancelText || t.no
    });
  };

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
      const totalSeats = rideData?.seats || 0;

      // Get the request details to check requested seats
      const requestDoc = await getDoc(doc(db, 'ride_requests', requestId));
      const requestData = requestDoc.data();
      const requestedSeats = requestData?.requested_seats || 1;

      // Get all current passengers to calculate total seats taken
      const currentPassengersQuery = query(
        collection(db, 'ride_requests'),
        where('ride_id', '==', params.rideId),
        where('status', 'in', ['accepted', 'checked_in'])
      );
      const currentPassengersSnapshot = await getDocs(currentPassengersQuery);
      
      let totalSeatsTaken = 0;
      currentPassengersSnapshot.forEach(doc => {
        const passengerData = doc.data();
        totalSeatsTaken += passengerData.requested_seats || 1;
      });

      // Check if accepting this request would exceed total seats
      if (totalSeatsTaken + requestedSeats > totalSeats) {
        showAlert({
          visible: true,
          title: t.insufficientSeats,
          message: `${t.onlyAvailableSeats} ${totalSeats - totalSeatsTaken} ${totalSeats - totalSeatsTaken === 1 ? t.seat : t.seats}`,
          type: 'warning',
          onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
          confirmText: t.ok
        });
        return;
      }

      // Show confirmation alert
      showAlert({
        visible: true,
        title: t.confirmAcceptRequest,
        message: `${t.acceptRequestFor} ${passengerName}?`,
        type: 'info',
        onConfirm: async () => {
          setAlertConfig(prev => ({ ...prev, visible: false }));

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

          showAlert({
            visible: true,
            title: t.bookingAcceptedSuccess,
            message: `${t.bookingAcceptedFor} ${passengerName}`,
            type: 'success',
            onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
            confirmText: t.ok
          });
        },
        onCancel: () => setAlertConfig(prev => ({ ...prev, visible: false }))
      });
    } catch (error) {
      console.error('Error accepting request:', error);
      showAlert({
        visible: true,
        title: t.errorAcceptingRequest,
        message: t.tryAgainLater,
        type: 'error',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: t.ok
      });
    }
  };

  const handleRejectRequest = async (requestId: string, userId: string) => {
    try {
      if (Platform.OS === 'android') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const userDoc = await getDoc(doc(db, 'users', userId));
      const passengerName = userDoc.data()?.name || t.passenger;

      showAlert({
        visible: true,
        title: t.confirmRejectRequest,
        message: `${t.rejectRequestFor} ${passengerName}?`,
        type: 'warning',
        onConfirm: async () => {
          setAlertConfig(prev => ({ ...prev, visible: false }));

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

          showAlert({
            visible: true,
            title: t.bookingRejectedSuccess,
            message: `${t.bookingRejectedFor} ${passengerName}`,
            type: 'success',
            onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
            confirmText: t.ok
          });
        },
        onCancel: () => setAlertConfig(prev => ({ ...prev, visible: false }))
      });
    } catch (error) {
      console.error('Error rejecting request:', error);
      showAlert({
        visible: true,
        title: t.errorRejectingRequest,
        message: t.tryAgainLater,
        type: 'error',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: t.ok
      });
    }
  };

  const handleCancelPassengerBooking = async (requestId: string, userId: string) => {
    try {
      if (Platform.OS === 'android') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      const userDoc = await getDoc(doc(db, 'users', userId));
      const passengerName = userDoc.data()?.name || t.passenger;

      showAlert({
        visible: true,
        title: t.cancelBooking,
        message: t.cancelBookingConfirmation,
        type: 'warning',
        onConfirm: async () => {
          setAlertConfig(prev => ({ ...prev, visible: false }));

          // Get the request details to restore seats
          const requestDoc = await getDoc(doc(db, 'ride_requests', requestId));
          const requestData = requestDoc.data();
          const requestedSeats = requestData?.requested_seats || 1;

          // Get the ride details to update available seats
          const rideDoc = await getDoc(doc(db, 'rides', params.rideId as string));
          const rideData = rideDoc.data();
          const currentAvailableSeats = rideData?.available_seats || 0;

          // Update the ride's available seats
          await updateDoc(doc(db, 'rides', params.rideId as string), {
            available_seats: currentAvailableSeats + requestedSeats,
            updated_at: serverTimestamp(),
          });

          // Update the request status
          await updateDoc(doc(db, 'ride_requests', requestId), {
            status: 'cancelled',
            updated_at: serverTimestamp(),
          });

          // Send notification to passenger
          await sendRideStatusNotification(
            userId,
            t.bookingCancelled,
            `${t.bookingCancelledByDriver} ${params.origin} ${t.to} ${params.destination}`,
            params.rideId as string
          );

          // Update local state
          setCurrentPassengers(prevPassengers => 
            prevPassengers.filter(passenger => passenger.id !== requestId)
          );

          showAlert({
            visible: true,
            title: t.bookingCancelledSuccess,
            message: `${t.bookingCancelledFor} ${passengerName}`,
            type: 'success',
            onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
            confirmText: t.ok
          });
        },
        onCancel: () => setAlertConfig(prev => ({ ...prev, visible: false }))
      });
    } catch (error) {
      console.error('Error cancelling passenger booking:', error);
      showAlert({
        visible: true,
        title: t.errorCancellingBooking,
        message: t.tryAgainLater,
        type: 'error',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: t.ok
      });
  }
  };

  const renderPassengerCard = (item: RideRequest, isCurrentPassenger: boolean = false) => (
    <Animated.View 
      key={item.id} 
      className={`bg-white mb-4 rounded-2xl overflow-hidden ${isCurrentPassenger ? 'p-3' : 'p-4'}`}
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 5,
        transform: [{ scale: 1 }],
      }}
    >
      <LinearGradient
        colors={['#fff', '#fff']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className={isCurrentPassenger ? 'p-2' : 'p-4'}
      >
        <TouchableOpacity 
          onPress={() => router.push({
            pathname: '/profile/[id]',
            params: { id: item.user_id }
          })}
          className={`flex-row items-center ${isCurrentPassenger ? 'mb-2' : 'mb-4'} ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}
        >
          <View className={`${isCurrentPassenger ? 'w-12 h-12' : 'w-16 h-16'} rounded-full bg-gray-100 items-center justify-center overflow-hidden border-2 ${isCurrentPassenger ? 'border-green-500' : 'border-orange-500'} ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
            {item.profile_image_url ? (
              <Image
                source={{ uri: item.profile_image_url }}
                className="w-full h-full"
              />
            ) : (
              <MaterialIcons name="person" size={isCurrentPassenger ? 24 : 32} color={isCurrentPassenger ? "#22c55e" : "#f97316"} />
            )}
          </View>
          <View className="flex-1">
            <Text className={`${isCurrentPassenger ? 'text-lg' : 'text-xl'} font-CairoBold text-gray-800 mb-1`}>
              {item.passenger_name}
            </Text>
            <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <MaterialIcons name="access-time" style={{marginBottom: 4}} size={14} color="#6B7280" />
              <Text className={`text-xs text-gray-500 font-CairoRegular ${language === 'ar' ? 'mr-1' : 'ml-1'}`}>
                {item.created_at ? new Date(item.created_at.toDate()).toLocaleTimeString() : t.unspecified}
              </Text>
            </View>
          </View>
          <MaterialIcons 
            name={language === 'ar' ? "chevron-left" : "chevron-right"} 
            size={20} 
            color="#6B7280" 
          />
        </TouchableOpacity>

        {item.selected_waypoint && (
          <View className={`bg-orange-50 rounded-xl ${isCurrentPassenger ? 'p-2 mb-2' : 'p-4 mb-4'} border border-orange-100`}>
            <View className={`flex-row justify-start items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <MaterialIcons name="location-on" size={isCurrentPassenger ? 16 : 20} color="#f97316" />
              <Text className={`${isCurrentPassenger ? 'text-sm' : 'text-base'} text-gray-700 font-CairoBold ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
                {t.stopPoint}:
              </Text>
              <Text className={`${isCurrentPassenger ? 'text-xs' : 'text-sm'} text-gray-600 font-CairoRegular ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
                {item.selected_waypoint.address === params.origin ? (
                  t.startingPoint
                ) : (
                  item.selected_waypoint.address
                )}
              </Text>
            </View>
          </View>
        )}

        <View className={`bg-blue-50 rounded-xl ${isCurrentPassenger ? 'p-2 mb-2' : 'p-4 mb-4'} border border-blue-100`}>
          <View className={`flex-row justify-start items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <MaterialIcons name="event-seat" size={isCurrentPassenger ? 16 : 20} color="#2563EB" />
            <Text className={`${isCurrentPassenger ? 'text-sm' : 'text-base'} text-gray-700 font-CairoBold ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
              {t.requestedSeats}:
            </Text>
            <Text className={`${isCurrentPassenger ? 'text-xs' : 'text-sm'} text-gray-600 font-CairoRegular ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
              {item.requested_seats || 1} {item.requested_seats === 1 ? t.seat : t.seats}
            </Text>
          </View>
        </View>

        {!isCurrentPassenger && (
          <View className="flex-row justify-between mt-2 space-x-3">
            <CustomButton
              title={t.accept}
              onPress={() => handleAcceptRequest(item.id, item.user_id)}
              className="bg-green-500 flex-1 px-6 rounded-xl py-3"
              icon={<MaterialIcons name="check-circle" size={20} color="white" />}
            />
            <CustomButton
              title={t.reject}
              onPress={() => handleRejectRequest(item.id, item.user_id)}
              className="bg-red-500 flex-1 px-6 rounded-xl py-3"
              icon={<MaterialIcons name="cancel" size={20} color="white" />}
            />
          </View>
        )}

        {isCurrentPassenger && (
          <View className="mt-2">
            <CustomButton
              title={t.cancelBooking}
              onPress={() => handleCancelPassengerBooking(item.id, item.user_id)}
              className="bg-red-500 w-full px-6 rounded-xl py-2"
              icon={<MaterialIcons name="cancel" size={18} color="white" />}
            />
      </View>
        )}
      </LinearGradient>
    </Animated.View>
  );

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <Header title={t.bookingRequests} showProfileImage={false} showSideMenu={false} />
        <SkeletonLoading />
      </SafeAreaView>
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
          icon={<MaterialIcons name="refresh" size={20} color="white" />}
        />
    </View>
  );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <Header title={t.bookingRequests} showProfileImage={false} showSideMenu={false} />

      {/* Custom Alert */}
      <CustomAlert {...alertConfig} />

      <ScrollView 
        ref={scrollViewRef}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={true}
        className="flex-1"
      >
        <View className="flex-1 p-4">
          {/* Current Passengers Section */}
          {currentPassengers.length > 0 && (
            <View className="mb-6">
              <View className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <MaterialIcons name="people" size={24} color="#f97316" />
                <Text className={`text-xl font-CairoBold text-gray-800 ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
                {language === 'ar' ? 'الركاب الحاليين' : 'Current Passengers'}
              </Text>
              </View>
              {currentPassengers.map(item => renderPassengerCard(item, true))}
            </View>
          )}

          {/* Pending Requests Section */}
          <View>
            <View className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <MaterialIcons name="pending-actions" size={24} color="#f97316" />
              <Text className={`text-xl font-CairoBold text-gray-800 ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
              {language === 'ar' ? 'طلبات الحجز المعلقة' : 'Pending Requests'}
            </Text>
            </View>
            {requests.length === 0 ? (
              <View className="flex-1 justify-center items-center p-8 bg-white rounded-2xl">
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