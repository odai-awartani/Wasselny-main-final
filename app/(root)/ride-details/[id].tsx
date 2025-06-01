import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Platform, TextInput, Animated, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc, addDoc, collection, serverTimestamp, updateDoc, onSnapshot, query, where, getDocs, Timestamp, orderBy, limit, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, parse } from 'date-fns';
import { db } from '@/lib/firebase';
import RideLayout from '@/components/RideLayout';
import { icons } from '@/constants';
import RideMap from '@/components/RideMap';
import CustomButton from '@/components/CustomButton';
import { useAuth } from '@clerk/clerk-expo';
import { scheduleNotification, setupNotifications, cancelNotification, sendRideStatusNotification, sendRideRequestNotification, startRideNotificationService, schedulePassengerRideReminder, sendCheckOutNotificationForDriver, scheduleDriverRideReminder, scheduleRideNotification } from '@/lib/notifications';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import BottomSheet from '@gorhom/bottom-sheet';
import { AirbnbRating } from 'react-native-ratings';
import { useLanguage } from '@/context/LanguageContext';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';

interface DriverData {
  car_seats?: number;
  car_type?: string;
  profile_image_url?: string;
  car_image_url?: string;
  origin_street?: string;
  destination_street?: string;
}

interface UserData {
  name?: string;
  driver?: DriverData;
  gender?: string;
}

interface Ride {
  id: string;
  origin_address: string;
  destination_address: string;
  origin_latitude?: number;
  origin_longitude?: number;
  destination_latitude?: number;
  destination_longitude?: number;
  origin_street?: string;
  destination_street?: string;
  created_at: any;
  ride_datetime: string;
  driver_id?: string;
  status: 'available' | 'full' | 'in-progress' | 'completed' | 'cancelled';
  available_seats: number;
  is_recurring: boolean;
  no_children: boolean;
  no_music: boolean;
  no_smoking: boolean;
  required_gender: string;
  ride_days?: string[];
  ride_number: number;
  driver?: {
    name: string;
    car_seats: number;
    profile_image_url?: string;
    car_type: string;
    car_image_url?: string;
  };
  waypoints?: { latitude: number; longitude: number; address: string; street?: string }[];
}

interface RideRequest {
  id: string;
  ride_id: string;
  user_id: string;
  status: 'waiting' | 'accepted' | 'rejected' | 'checked_in' | 'checked_out' | 'cancelled';
  created_at: any;
  rating?: number;
  notification_id?: string;
  passenger_name?: string;
  is_waitlist?: boolean;
  requested_seats?: number;
  selected_waypoint?: {
    latitude: number;
    longitude: number;
    address: string;
    street?: string;
  } | null;
}

interface RatingData {
  overall: number;
  driving: number;
  behavior: number;
  punctuality: number;
  cleanliness: number;
  comment?: string;
  ride_id: string;
  driver_id: string;
  passenger_id: string;
  passenger_name: string;
  ride_details: {
    origin_address: string;
    destination_address: string;
    ride_datetime: string;
  };
  created_at: any;
}

const DEFAULT_DRIVER_NAME = 'Unknown Driver';
const DEFAULT_CAR_SEATS = 4;
const DEFAULT_CAR_TYPE = 'Unknown';
const DEFAULT_PROFILE_IMAGE = 'https://via.placeholder.com/40';
const DEFAULT_CAR_IMAGE = 'https://via.placeholder.com/120x80';
const DATE_FORMAT = 'dd/MM/yyyy HH:mm';

const RideDetails = () => {
  const [allPassengers, setAllPassengers] = useState<RideRequest[]>([]);
  const [passengerNames, setPassengerNames] = useState<Record<string, string>>({});
  const [passengerGenders, setPassengerGenders] = useState<Record<string, string>>({});
  const router = useRouter();
  const { id, notificationId } = useLocalSearchParams();
  const scrollViewRef = useRef<ScrollView>(null);
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [ride, setRide] = useState<Ride | null>(null);
  const [rideRequest, setRideRequest] = useState<RideRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState<RatingData>({
    overall: 0,
    driving: 0,
    behavior: 0,
    punctuality: 0,
    cleanliness: 0,
    comment: '',
    ride_id: '',
    driver_id: '',
    passenger_id: '',
    passenger_name: '',
    ride_details: {
      origin_address: '',
      destination_address: '',
      ride_datetime: ''
    },
    created_at: null
  });
  const { userId } = useAuth();
  const isDriver = ride?.driver_id === userId;
  const isPassenger = rideRequest && rideRequest.status === 'accepted';
  const [isRideTime, setIsRideTime] = useState(false);

  console.log('isRideTime', isRideTime);
  // Add new state for waypoint selection modal
  const [showWaypointModal, setShowWaypointModal] = useState(false);
  const [selectedWaypoint, setSelectedWaypoint] = useState<{ latitude: number; longitude: number; address: string; street?: string } | null>(null);

  // Add new state for pending requests count
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  const { t, language } = useLanguage();

  // Add new state for seat selection modal
  const [showSeatModal, setShowSeatModal] = useState(false);
  const [selectedSeats, setSelectedSeats] = useState(1);

  // Add new state for animation
  const [modalAnimation] = useState(new Animated.Value(0));

  // Add animation function
  const animateModal = (show: boolean) => {
    Animated.spring(modalAnimation, {
      toValue: show ? 1 : 0,
      useNativeDriver: true,
      tension: 50,
      friction: 7
    }).start();
  };

  // Cache helper functions
  const cacheRideDetails = async (rideId: string, rideData: Ride) => {
    try {
      await AsyncStorage.setItem(`ride_${rideId}`, JSON.stringify(rideData));
    } catch (err) {
      console.error('Error caching ride details:', err);
    }
  };

  const getCachedRideDetails = async (rideId: string): Promise<Ride | null> => {
    try {
      const cached = await AsyncStorage.getItem(`ride_${rideId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      console.error('Error retrieving cached ride details:', err);
      return null;
    }
  };

  // Setup notifications
  useEffect(() => {
    if (userId) {
      setupNotifications(userId).catch((err) => console.error('Error setting up notifications:', err));
      startRideNotificationService(userId, true).catch((err) => console.error('Error starting notification service:', err));
    }
  }, [userId]);

  // Handle notification when page loads
  useEffect(() => {
    if (notificationId && typeof notificationId === 'string') {
      const markNotificationAsRead = async () => {
        try {
          const notificationRef = doc(db, 'notifications', notificationId);
          await updateDoc(notificationRef, { read: true });
          if (scrollViewRef.current && allPassengers.length > 0) {
            scrollViewRef.current.scrollTo({ y: 600, animated: true });
          }
        } catch (error) {
          console.error('Error marking notification as read:', error);
        }
      };
      markNotificationAsRead();
    }
  }, [notificationId, allPassengers]);

  // Fetch ride details
  const fetchRideDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Check cache first
      const cachedRide = await getCachedRideDetails(id as string);
      if (cachedRide) {
        setRide(cachedRide);
        setLoading(false);
      }

      const rideDocRef = doc(db, 'rides', id as string);
      const rideDocSnap = await getDoc(rideDocRef);

      if (!rideDocSnap.exists()) {
        setError('لم يتم العثور على الرحلة.');
        setLoading(false);
        return;
      }

      const rideData = rideDocSnap.data();

      let driverInfo: UserData = { name: DEFAULT_DRIVER_NAME };
      if (rideData.driver_id) {
        const userDocRef = doc(db, 'users', rideData.driver_id);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          driverInfo = userDocSnap.data() as UserData;
        } else {
          console.warn(`User not found for driver_id: ${rideData.driver_id}`);
        }
      }

      let formattedDateTime = rideData.ride_datetime;
      if (rideData.ride_datetime instanceof Timestamp) {
        formattedDateTime = format(rideData.ride_datetime.toDate(), DATE_FORMAT);
      } else {
        try {
          const parsedDate = parse(rideData.ride_datetime, DATE_FORMAT, new Date());
          if (!isNaN(parsedDate.getTime())) {
            formattedDateTime = format(parsedDate, DATE_FORMAT);
          } else {
            console.warn('Invalid ride_datetime format');
          }
        } catch {
          console.warn('Invalid ride_datetime format');
        }
      }

      const rideDetails: Ride = {
        id: rideDocSnap.id,
        origin_address: rideData.origin_address || 'غير معروف',
        destination_address: rideData.destination_address || 'غير معروف',
        origin_latitude: rideData.origin_latitude || 0,
        origin_longitude: rideData.origin_longitude || 0,
        destination_latitude: rideData.destination_latitude || 0,
        destination_longitude: rideData.destination_longitude || 0,
        origin_street: rideData.origin_street,
        destination_street: rideData.destination_street,
        created_at: rideData.created_at,
        ride_datetime: formattedDateTime,
        status: rideData.status || 'available',
        available_seats: rideData.available_seats || 0,
        is_recurring: rideData.is_recurring || false,
        no_children: rideData.no_children || false,
        no_music: rideData.no_music || false,
        no_smoking: rideData.no_smoking || false,
        required_gender: rideData.required_gender || 'كلاهما',
        ride_days: rideData.ride_days || [],
        ride_number: rideData.ride_number || 0,
        driver_id: rideData.driver_id,
        driver: {
          name: driverInfo.name || DEFAULT_DRIVER_NAME,
          car_seats: driverInfo.driver?.car_seats || DEFAULT_CAR_SEATS,
          profile_image_url: driverInfo.driver?.profile_image_url || DEFAULT_PROFILE_IMAGE,
          car_type: driverInfo.driver?.car_type || DEFAULT_CAR_TYPE,
          car_image_url: driverInfo.driver?.car_image_url || DEFAULT_CAR_IMAGE,
        },
        waypoints: rideData.waypoints?.map((waypoint: any) => ({
          latitude: waypoint.latitude,
          longitude: waypoint.longitude,
          address: waypoint.address,
          street: waypoint.street
        })) || [],
      };

      // Update local state with latest data
      setRide(rideDetails);
      await cacheRideDetails(id as string, rideDetails);

      // Set up real-time listener for ride status changes
      const unsubscribe = onSnapshot(rideDocRef, (doc) => {
        if (doc.exists()) {
          const updatedData = doc.data();
          setRide(prevRide => prevRide ? { ...prevRide, status: updatedData.status } : null);
        }
      });

      return () => unsubscribe();
    } catch (err) {
      console.error('Error fetching ride details:', err);
      setError('فشل تحميل تفاصيل الرحلة. تحقق من اتصالك بالإنترنت وحاول مجددًا.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Monitor ride request status
  useEffect(() => {
    if (!userId || !id) {
      setLoading(false);
      return;
    }

    const rideRequestsRef = collection(db, 'ride_requests');
    const q = query(rideRequestsRef, where('ride_id', '==', id), where('user_id', '==', userId));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          setRideRequest({ id: doc.id, ...doc.data() } as RideRequest);
        } else {
          setRideRequest(null);
        }
      },
      (error) => {
        console.error('Error fetching ride request:', error);
        setError('فشل تحميل طلب الحجز. تحقق من اتصالك بالإنترنت.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [id, userId]);

  // Fetch all passengers for the ride
  useEffect(() => {
    if (!ride?.id) return;

    const fetchPassengers = async () => {
      try {
        const rideRequestsRef = collection(db, 'ride_requests');
        const q = query(rideRequestsRef, where('ride_id', '==', ride.id), where('status', 'in', ['accepted', 'checked_in', 'checked_out']));
        const snapshot = await getDocs(q);
        const passengers: RideRequest[] = [];
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          passengers.push({ id: doc.id, ...data } as RideRequest);
        });
        
        setAllPassengers(passengers);
      } catch (error) {
        console.error('Error fetching passengers:', error);
        setError('فشل تحميل قائمة الركاب.');
      }
    };

    fetchPassengers();
  }, [ride?.id]);

  // Fetch passenger names and genders
  useEffect(() => {
    const fetchPassengerDetails = async () => {
      try {
        const passengerIds = allPassengers.map((p) => p.user_id);
        if (!passengerIds.length) return;

        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('__name__', 'in', passengerIds));
        const querySnapshot = await getDocs(q);

        const names: Record<string, string> = {};
        const genders: Record<string, string> = {};
        querySnapshot.forEach((doc) => {
          const userData = doc.data();
          names[doc.id] = userData?.name || 'الراكب';
          genders[doc.id] = userData?.gender || 'غير محدد';
        });

        setPassengerNames(names);
        setPassengerGenders(genders);
      } catch (error) {
        console.error('Error fetching passenger details:', error);
        setError('فشل تحميل بيانات الركاب.');
      }
    };

    if (allPassengers.length > 0) {
      fetchPassengerDetails();
    }
  }, [allPassengers]);

  // Update the useEffect for pending requests count to use onSnapshot
  useEffect(() => {
    if (!ride?.id) return;

    const rideRequestsRef = collection(db, 'ride_requests');
    const q = query(
      rideRequestsRef,
      where('ride_id', '==', ride.id),
      where('status', '==', 'waiting')
    );

    // Set up real-time listener
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingRequestsCount(snapshot.size);
    }, (error) => {
      console.error('Error listening to pending requests:', error);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [ride?.id]);

  // Handle booking a ride
  const handleBookRide = async () => {
    try {
      if (Platform.OS === 'android') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (!ride || !ride.id || !ride.driver_id || !userId) {
        showAlert({
          title: language === 'ar' ? "خطأ" : "Error",
          message: language === 'ar' ? "معلومات الرحلة غير مكتملة" : "Ride information is incomplete",
          type: 'error'
        });
        return;
      }

      // Check if ride has already started or completed
      if (ride.status === 'in-progress' || ride.status === 'completed' || ride.status === 'cancelled') {
        showAlert({
          title: language === 'ar' ? "غير متاح" : "Unavailable",
          message: language === 'ar' ? "لا يمكن حجز هذه الرحلة لأنها قد بدأت أو انتهت أو تم إلغاؤها ." : "Ride is already in progress, completed, or cancelled. Cannot book a seat.",
          type: 'warning'
        });
        return;
      }

      // Check if ride is full
      if (ride.available_seats === undefined || ride.available_seats <= 0) {
        showAlert({
          title: language === 'ar' ? "الرحلة ممتلئة" : "Full",
          message: language === 'ar' ? "الرحلة ممتلئة حالياً، ولكن يمكنك إرسال طلب حجز. إذا غادر أي راكب، سيتم إخطارك عند قبول طلبك." : "The ride is full at the moment, but you can still book a seat. If any passenger leaves, you will be notified when your request is accepted.",
          type: 'info',
          showCancel: true,
          confirmText: language === 'ar' ? "إرسال طلب" : "Send Request",
          cancelText: language === 'ar' ? "إلغاء" : "Cancel",
          onConfirm: () => setShowSeatModal(true)
        });
        return;
      }

      setShowSeatModal(true);
    } catch (error) {
      console.error('Booking error:', error);
      showAlert({
        title: language === 'ar' ? "خطأ" : "Error",
        message: language === 'ar' ? "حدث خطأ أثناء إرسال طلب الحجز" : "An error occurred while sending the booking request",
        type: 'error'
      });
    }
  };

  // Add new function to handle booking with seat selection
  const handleBookRideWithSeats = async (seats: number) => {
    try {
      if (Platform.OS === 'android') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (!ride || !ride.id || !ride.driver_id || !userId) {
        Alert.alert('معلومات الرحلة غير مكتملة');
        return;
      }

      // Check if ride has already started or completed
      if (ride.status === 'in-progress' || ride.status === 'completed' || ride.status === 'cancelled') {
        Alert.alert('غير متاح', 'لا يمكن حجز هذه الرحلة لأنها قد بدأت أو انتهت أو تم إلغاؤها .');
        return;
      }

      // Check if requested seats are available
      if (ride.available_seats < seats) {
        Alert.alert(
          'المقاعد غير متوفرة',
          `عذراً، لا يوجد سوى ${ride.available_seats} مقاعد متاحة.`,
          [{ text: 'حسناً', style: 'cancel' }]
        );
        return;
      }

      // Get user's data
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userData = userDoc.data();
      const userName = userData?.name || 'الراكب';
      const userGender = userData?.gender || 'غير محدد';

      // Check gender requirements
      if (ride.required_gender !== 'كلاهما') {
        if (ride.required_gender === 'ذكر' && userGender !== 'Male') {
          Alert.alert('غير مسموح', 'هذه الرحلة مخصصة للركاب الذكور فقط.');
          return;
        }
        if (ride.required_gender === 'أنثى' && userGender !== 'Female') {
          Alert.alert('غير مسموح', 'هذه الرحلة مخصصة للركاب الإناث فقط.');
          return;
        }
      }

      // Show waypoint selection if available
      if (ride.waypoints && ride.waypoints.length > 0) {
        setShowWaypointModal(true);
      } else {
        handleBookRideWithWaypoint(null, seats);
      }
    } catch (error) {
      console.error('Booking error:', error);
      Alert.alert('حدث خطأ أثناء إرسال طلب الحجز.');
    }
  };

  // Add new function to handle booking with waypoint
  const handleBookRideWithWaypoint = async (waypoint: { latitude: number; longitude: number; address: string; street?: string } | null, seats: number = 1) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId as string));
      const userData = userDoc.data();
      const userName = userData?.name || 'الراكب';

      // Create the ride request data with proper waypoint handling
      const rideRequestData = {
        ride_id: ride?.id,
        user_id: userId,
        driver_id: ride?.driver_id,
        status: 'waiting',
        created_at: serverTimestamp(),
        passenger_name: userName,
        is_waitlist: ride?.available_seats === 0,
        requested_seats: seats,
        selected_waypoint: waypoint ? {
          latitude: waypoint.latitude,
          longitude: waypoint.longitude,
          address: waypoint.address,
          ...(waypoint.street && { street: waypoint.street })
        } : null
      };

      const rideRequestRef = await addDoc(collection(db, 'ride_requests'), rideRequestData);

      if (ride?.driver_id) {
        await sendRideRequestNotification(
          ride.driver_id,
          userName,
          ride.origin_address || '',
          ride.destination_address || '',
          ride.id
        );
      }

      // Show success modal instead of alert
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Booking error:', error);
      // Show error modal instead of alert
      setShowErrorModal(true);
    }
  };

  // Add new state for modals
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);

  // Add success modal component
  const renderSuccessModal = () => (
    <Modal
      visible={showSuccessModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowSuccessModal(false)}
    >
      <View className="flex-1 justify-center items-center bg-black/50">
        <View className="bg-white w-[85%] rounded-2xl p-6">
          <View className="items-center mb-4">
            <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center mb-4">
              <MaterialIcons name="check-circle" size={40} color="#22c55e" />
            </View>
            <Text className="text-xl font-CairoBold text-gray-800 text-center mb-2">
              {language === 'ar' ? "تم إرسال طلب الحجز بنجاح" : "Booking request sent successfully"}
            </Text>
            <Text className="text-base text-gray-600 text-center font-CairoRegular">
              {language === 'ar' 
                ? "سيتم إخطارك عند قبول طلبك" 
                : "You will be notified when your request is accepted"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowSuccessModal(false)}
            className="bg-orange-500 py-3 rounded-xl mt-4"
          >
            <Text className="text-white text-center font-CairoBold text-lg">
              {language === 'ar' ? "حسناً" : "OK"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // Add error modal component
  const renderErrorModal = () => (
    <Modal
      visible={showErrorModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowErrorModal(false)}
    >
      <View className="flex-1 justify-center items-center bg-black/50">
        <View className="bg-white w-[85%] rounded-2xl p-6">
          <View className="items-center mb-4">
            <View className="w-16 h-16 bg-red-100 rounded-full items-center justify-center mb-4">
              <MaterialIcons name="error-outline" size={40} color="#ef4444" />
            </View>
            <Text className="text-xl font-CairoBold text-gray-800 text-center mb-2">
              {language === 'ar' ? "حدث خطأ" : "Error"}
            </Text>
            <Text className="text-base text-gray-600 text-center font-CairoRegular">
              {language === 'ar' 
                ? "حدث خطأ أثناء إرسال طلب الحجز. يرجى المحاولة مرة أخرى" 
                : "An error occurred while sending the booking request. Please try again"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowErrorModal(false)}
            className="bg-orange-500 py-3 rounded-xl mt-4"
          >
            <Text className="text-white text-center font-CairoBold text-lg">
              {language === 'ar' ? "حسناً" : "OK"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // Handle driver accepting ride request
  // const handleAcceptRequest = async (requestId: string, userId: string) => {
  //   try {
  //     // Get passenger's name
  //     const userDoc = await getDoc(doc(db, 'users', userId));
  //     const passengerName = userDoc.data()?.name || 'الراكب';
  
  //     // افترض أن ride هو كائن تم تعريفه مسبقًا (يحتوي على id, driver_id, origin_address, destination_address)
  //     if (!ride) {
  //       throw new Error('بيانات الرحلة غير متوفرة');
  //     }
  
  //     if (!ride.driver_id) {
  //       throw new Error('معرف السائق غير موجود');
  //     }

  //     // Check if ride is full
  //     if (ride.available_seats <= 0) {
  //       Alert.alert(
  //         'الرحلة ممتلئة',
  //         'لا يمكن قبول المزيد من الطلبات لأن الرحلة ممتلئة. سيتم إخطار الراكب عندما يصبح هناك مقعد متاح.'
  //       );
  //       return;
  //     }
  //         // جدولة إشعار للراكب
  //   const passengerNotificationId = await scheduleRideNotification(ride.id, userId, false); // false لأنه راكب

  //   // جدولة إشعار للسائق
  //   const driverNotificationId = await scheduleRideNotification(ride.id, ride.driver_id, true); // true لأنه سائق



  //     await updateDoc(doc(db, 'ride_requests', requestId), {
  //       status: 'accepted',
  //       updated_at: serverTimestamp(),
  //       passenger_name: passengerName,
  //       passenger_id: userId,
  //       notification_id: passengerNotificationId || null,
  //     });

  //      // إرسال إشعار فوري للراكب
  //      await sendRideStatusNotification(
  //       userId,
  //       'تم قبول طلب الحجز!',
  //       `تم قبول طلب حجزك للرحلة من ${ride.origin_address} إلى ${ride.destination_address}`,
  //       ride.id
  //     );

  //     const notificationsRef = collection(db, 'notifications');
  //     const q = query(
  //       notificationsRef,
  //       where('user_id', '==', userId),
  //       where('data.rideId', '==', ride.id),
  //       where('type', '==', 'ride_request')
  //     );

  //     const querySnapshot = await getDocs(q);
  //     for (const doc of querySnapshot.docs) {
  //       await updateDoc(doc.ref, {
  //         read: true,
  //         data: {
  //           status: 'accepted',
  //           rideId: ride.id,
  //           type: 'ride_status',
  //           passenger_name: passengerName,
  //         },
  //       });
  //     }

  //     Alert.alert('✅ تم قبول طلب الحجز بنجاح', `تم قبول طلب ${passengerName}`);
  //   } catch (error) {
  //     console.error('Error accepting request:', error);
  //     Alert.alert('حدث خطأ أثناء قبول الطلب.');
  //   }
  // };

  // Handle check-in
  const handleCheckIn = async () => {
    try {
      if (Platform.OS === 'android') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (!rideRequest || !ride || !userId) {
        showAlert({
          title: language === 'ar' ? "خطأ" : "Error",
          message: language === 'ar' ? "معلومات الرحلة غير مكتملة" : "Ride information is incomplete",
          type: 'error'
        });
        return;
      }

      showAlert({
        title: language === 'ar' ? "جاري تسجيل الدخول" : "Checking In",
        message: language === 'ar' ? "جاري تسجيل دخولك..." : "Checking you in...",
        type: 'info',
        isLoading: true
      });

      await updateDoc(doc(db, 'ride_requests', rideRequest.id), {
        status: 'checked_in',
        updated_at: serverTimestamp()
      });

      await sendRideStatusNotification(
        ride.driver_id || '',
        'الراكب وصل',
        `الراكب قد وصل وبدأ الرحلة من ${ride.origin_address} إلى ${ride.destination_address}`,
        ride.id
      );

      showAlert({
        title: language === 'ar' ? "تم تسجيل الدخول" : "Checked In",
        message: language === 'ar' ? "تم تسجيل دخولك بنجاح" : "Successfully checked in",
        type: 'success'
      });
    } catch (error) {
      console.error('Error during check-in:', error);
      showAlert({
        title: language === 'ar' ? "خطأ" : "Error",
        message: language === 'ar' ? "حدث خطأ أثناء تسجيل الدخول" : "An error occurred while checking in",
        type: 'error'
      });
    }
  };

  // Handle check-out
  const handleCheckOut = async () => {
    try {
      if (Platform.OS === 'android') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (!rideRequest || !ride || !userId) {
        showAlert({
          title: language === 'ar' ? "خطأ" : "Error",
          message: language === 'ar' ? "معلومات الرحلة غير مكتملة" : "Ride information is incomplete",
          type: 'error'
        });
        return;
      }

      showAlert({
        title: language === 'ar' ? "جاري تسجيل الخروج" : "Checking Out",
        message: language === 'ar' ? "جاري تسجيل خروجك..." : "Checking you out...",
        type: 'info',
        isLoading: true
      });

      if (rideRequest.notification_id) {
        await cancelNotification(rideRequest.notification_id);
        console.log(`Cancelled notification ${rideRequest.notification_id}`);
      }

      await updateDoc(doc(db, 'ride_requests', rideRequest.id), {
        status: 'checked_out',
        updated_at: serverTimestamp()
      });

      const notificationSent = await sendCheckOutNotificationForDriver(
        ride.driver_id || '',
        passengerNames[userId] || 'الراكب',
        ride.id
      );

      if (!notificationSent) {
        console.warn('Failed to send check-out notification to driver');
      }

      showAlert({
        title: language === 'ar' ? "تم تسجيل الخروج" : "Checked Out",
        message: language === 'ar' ? "تم تسجيل خروجك بنجاح" : "Successfully checked out",
        type: 'success'
      });

      setShowRatingModal(true);
    } catch (error) {
      console.error('Check-out error:', error);
      showAlert({
        title: language === 'ar' ? "خطأ" : "Error",
        message: language === 'ar' ? "حدث خطأ أثناء تسجيل الخروج" : "An error occurred while checking out",
        type: 'error'
      });
    }
  };

  // Handle ride cancellation
  const handleCancelRide = async () => {
    try {
      if (Platform.OS === 'android') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (!rideRequest || !ride || !userId) {
        showAlert({
          title: language === 'ar' ? "خطأ" : "Error",
          message: language === 'ar' ? "معلومات الرحلة غير مكتملة" : "Ride information is incomplete",
          type: 'error'
        });
        return;
      }

      showAlert({
        title: language === 'ar' ? "تأكيد الإلغاء" : "Confirm Cancellation",
        message: language === 'ar' ? "هل أنت متأكد من إلغاء الحجز؟" : "Are you sure you want to cancel the booking?",
        type: 'warning',
        showCancel: true,
        confirmText: language === 'ar' ? "نعم" : "Yes",
        cancelText: language === 'ar' ? "لا" : "No",
        onConfirm: async () => {
          showAlert({
            title: language === 'ar' ? "جاري الإلغاء" : "Cancelling",
            message: language === 'ar' ? "جاري إلغاء الحجز..." : "Cancelling your booking...",
            type: 'info',
            isLoading: true
          });

          if (rideRequest.notification_id) {
            await cancelNotification(rideRequest.notification_id);
            console.log(`Cancelled notification ${rideRequest.notification_id}`);
          }

          await updateDoc(doc(db, 'ride_requests', rideRequest.id), {
            status: 'cancelled',
            updated_at: serverTimestamp(),
          });

          if (ride.status === 'full' && rideRequest.status === 'accepted') {
            await updateDoc(doc(db, 'rides', ride.id), {
              status: 'available',
              updated_at: serverTimestamp(),
            });
          }

          if (ride.driver_id) {
            const passengerName = passengerNames[userId] || 'الراكب';
            await sendRideStatusNotification(
              ride.driver_id,
              'تم إلغاء الحجز',
              `قام ${passengerName} بإلغاء حجز الرحلة من ${ride.origin_address} إلى ${ride.destination_address}`,
              ride.id
            );
          }

          showAlert({
            title: language === 'ar' ? "تم الإلغاء" : "Cancelled",
            message: language === 'ar' ? "تم إلغاء الحجز بنجاح" : "Booking cancelled successfully",
            type: 'success'
          });
        }
      });
    } catch (error) {
      console.error('Cancellation error:', error);
      showAlert({
        title: language === 'ar' ? "خطأ" : "Error",
        message: language === 'ar' ? "حدث خطأ أثناء إلغاء الحجز" : "An error occurred while cancelling the booking",
        type: 'error'
      });
    }
  };

  // Handle rating submission
  const handleRateDriver = async () => {
    try {
      if (Platform.OS === 'android') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (!rideRequest || !ride || !userId) {
        showAlert({
          title: language === 'ar' ? "خطأ" : "Error",
          message: language === 'ar' ? "معلومات الرحلة غير مكتملة" : "Ride information is incomplete",
          type: 'error'
        });
        return;
      }

      if (Object.values(rating).some(value => value === 0)) {
        showAlert({
          title: language === 'ar' ? "خطأ" : "Error",
          message: language === 'ar' ? "الرجاء تقييم جميع النقاط" : "Please rate all categories",
          type: 'error'
        });
        return;
      }

      showAlert({
        title: language === 'ar' ? "جاري إرسال التقييم" : "Submitting Rating",
        message: language === 'ar' ? "جاري إرسال تقييمك..." : "Submitting your rating...",
        type: 'info',
        isLoading: true
      });

      const userDoc = await getDoc(doc(db, 'users', userId));
      const passengerName = userDoc.data()?.name || 'الراكب';

      const ratingData: RatingData = {
        ...rating,
        ride_id: ride.id,
        driver_id: ride.driver_id || '',
        passenger_id: userId,
        passenger_name: passengerName,
        ride_details: {
          origin_address: ride.origin_address,
          destination_address: ride.destination_address,
          ride_datetime: ride.ride_datetime
        },
        created_at: serverTimestamp()
      };

      await addDoc(collection(db, 'ratings'), ratingData);

      await updateDoc(doc(db, 'ride_requests', rideRequest.id), {
        has_rating: true,
        updated_at: serverTimestamp(),
      });

      if (ride.driver_id) {
        await sendRideStatusNotification(
          ride.driver_id,
          'تقييم جديد!',
          `قام ${passengerName} بتقييم رحلتك بـ ${rating.overall} نجوم`,
          ride.id
        );
      }

      setShowRatingModal(false);
      showAlert({
        title: language === 'ar' ? "تم التقييم" : "Rating Submitted",
        message: language === 'ar' ? "شكراً على تقييمك!" : "Thank you for your rating!",
        type: 'success'
      });
    } catch (error) {
      console.error('Rating error:', error);
      showAlert({
        title: language === 'ar' ? "خطأ" : "Error",
        message: language === 'ar' ? "حدث خطأ أثناء إرسال التقييم" : "An error occurred while submitting the rating",
        type: 'error'
      });
    }
  };

  // Format time to 12-hour format
  const formatTimeTo12Hour = (timeStr: string) => {
    try {
      const [date, time] = timeStr.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      const period = hours >= 12 
        ? (language === 'ar' ? 'مساءً' : 'PM')
        : (language === 'ar' ? 'صباحاً' : 'AM');
      const formattedHours = hours % 12 || 12;
      return {
        date,
        time: `${formattedHours}:${minutes.toString().padStart(2, '0')} ${period}`,
      };
    } catch (error) {
      console.error('Error formatting time:', error);
      return {
        date: timeStr,
        time: timeStr,
      };
    }
  };

  // Memoized formatted ride data
  const formattedRide = useMemo(() => {
    if (!ride) return null;
    return {
      ...ride,
      formattedDateTime: ride.ride_datetime ? formatTimeTo12Hour(ride.ride_datetime) : { date: 'غير محدد', time: 'غير محدد' },
    };
  }, [ride]);

  // Render driver info
  const renderDriverInfo = useCallback(
    () => (
      <View
        className="bg-white w-[98%] mx-1 p-4 rounded-xl"
        style={Platform.OS === 'android' ? styles.androidShadow : styles.iosShadow}
      >
        <TouchableOpacity
          onPress={() => router.push(`/profile/${formattedRide?.driver_id}`)}
          className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}
        >
          <Image
            source={{ uri: formattedRide?.driver?.profile_image_url || DEFAULT_PROFILE_IMAGE }}
            className={`w-16 h-16 rounded-full ${language === 'ar' ? 'ml-4' : 'mr-4'}`}
          />
          <View className="flex-1">
            <Text className={`text-xl font-CairoBold mb-1 text-black ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {formattedRide?.driver?.name}
            </Text>
            <View className={`flex-row justify-between items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <Text className={`text-black font-CairoMedium ${language === 'ar' ? 'ml-2' : 'mr-2'}`}>
                {formattedRide?.driver?.car_type}
              </Text>
              <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <FontAwesome5 name="users" size={16} color="#000" />
                <Text className={`text-black font-CairoMedium ${language === 'ar' ? 'mr-1' : 'ml-1'}`}>
                  {`${formattedRide?.driver?.car_seats || DEFAULT_CAR_SEATS} ${language === 'ar' ? 'مقاعد السيارة' : 'car seats'}`}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    ),
    [formattedRide, language]
  );

  // Add this function to calculate total seats taken
  const calculateTotalSeatsTaken = useCallback(() => {
    return allPassengers.reduce((total, passenger) => {
      return total + (passenger.requested_seats || 1);
    }, 0);
  }, [allPassengers]);

  // Render ride details
  const renderRideDetails = useCallback(
    () => (
      <View
        className="bg-white w-[98%] mx-1 mt-3 p-4 rounded-xl"
        style={Platform.OS === 'android' ? styles.androidShadow : styles.iosShadow}
      >
        {ride?.status === 'in-progress' && !isDriver && (
          <View className="bg-blue-100 p-3 rounded-lg mb-4">
            <Text className="text-blue-800 font-CairoBold text-center text-lg">
              {language === 'ar' ? 'الرحلة جارية حالياً - لا يمكن حجز مقعد' : 'Ride is in progress - Cannot book a seat'}
            </Text>
          </View>
        )}
        
        {ride?.status === 'in-progress' && isDriver && (
          <View className="bg-green-100 p-3 rounded-lg mb-4">
            <Text className="text-green-800 font-CairoBold text-center text-lg">
              {language === 'ar' ? 'الرحلة جارية حالياً' : 'Ride is in progress'}
            </Text>
          </View>
        )}

        <View className={`flex-row mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className="flex-1">
            <View className={`flex-row items-center mb-3 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <Image source={icons.point} className={`w-6 h-6 ${language === 'ar' ? 'ml-3' : 'mr-3'}`} />
              <View className="flex-1">
                <Text className={`text-lg font-CairoBold text-black ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'من: ' : 'From: '}{formattedRide?.origin_address}
                </Text>
                {formattedRide?.origin_street && (
                  <Text className={`text-sm font-CairoRegular text-gray-600 mt-1 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {formattedRide.origin_street}
                  </Text>
                )}
              </View>
            </View>

            {formattedRide?.waypoints && Array.isArray(formattedRide.waypoints) && formattedRide.waypoints.length > 0 && (
              <View className="mt-4 mb-4">
                <View className={`flex-row items-center mb-3 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <Image source={icons.map} className={`w-6 h-6 ${language === 'ar' ? 'ml-3' : 'mr-3'}`} tintColor="#F79824" />
                  <Text className={`text-lg font-CairoBold text-black ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {language === 'ar' ? 'نقاط التوقف' : 'Waypoints'}
                  </Text>
                </View>
                <View className={`flex-row flex-wrap ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {formattedRide.waypoints?.map((waypoint, index) => (
                    <View key={index} className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <Text className={`text-base font-CairoMedium text-black ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                        {waypoint.address}
                      </Text>
                      {index < (formattedRide.waypoints?.length || 0) - 1 && (
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
              <Image source={icons.target} className={`w-6 h-6 ${language === 'ar' ? 'ml-3' : 'mr-3'}`} />
              <View className="flex-1">
                <Text className={`text-lg font-CairoBold text-black ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'إلى: ' : 'To: '}{formattedRide?.destination_address}
                </Text>
                {formattedRide?.destination_street && (
                  <Text className={`text-sm font-CairoRegular text-gray-600 mt-1 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {formattedRide.destination_street}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>

        <View className={`flex-row justify-between mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <MaterialIcons name="event" size={20} color="#000" className={language === 'ar' ? 'ml-3' : 'mr-3'} />
            <Text className={`text-black font-CairoMedium ${language === 'ar' ? 'ml-1' : 'mr-1'}`}>
              {formattedRide?.formattedDateTime?.date}
            </Text>
          </View>
          <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <MaterialIcons name="access-time" size={20} color="#ff0000" className={language === 'ar' ? 'ml-3' : 'mr-3'} />
            <Text className={`text-red-600 font-CairoMedium ${language === 'ar' ? 'ml-1' : 'mr-1'}`}>
              {formattedRide?.formattedDateTime?.time}
            </Text>
          </View>
        </View>

        <View className={`flex-row justify-between mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <MaterialIcons name="repeat" size={20} color="#000" className={language === 'ar' ? 'ml-3' : 'mr-3'} />
            <Text className={`text-black font-CairoMedium ${language === 'ar' ? 'ml-1' : 'mr-1'}`}>
              {formattedRide?.is_recurring 
                ? (language === 'ar' ? 'رحلة متكررة' : 'Recurring ride')
                : (language === 'ar' ? 'رحلة لمرة واحدة' : 'One-time ride')}
            </Text>
          </View>
          <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <MaterialIcons name="event-seat" size={20} color="#000" className={language === 'ar' ? 'ml-3' : 'mr-3'} />
            <Text className={`text-black font-CairoMedium ${language === 'ar' ? 'ml-1' : 'mr-1'}`}>
              {`${calculateTotalSeatsTaken()}/${formattedRide?.available_seats || DEFAULT_CAR_SEATS} ${language === 'ar' ? 'مقاعد' : 'seats'}`}
            </Text>
          </View>
        </View>

        {/* <View className="mb-1">
          <View className={`flex-row flex-wrap ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            {formattedRide?.is_recurring ? (
              formattedRide.ride_days?.map((day, index) => (
                <View key={index} className="bg-orange-100 px-3 py-1 rounded-full mr-2 mb-2">
                  <Text className="text-orange-800 font-CairoMedium text-sm">{day}</Text>
                </View>
              ))
            ) : null}
          </View>
        </View> */}

        <View className="mt-0">
          <View className={`flex-row items-center justify-between mb-3 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <View className={`flex-row items-center px-3 py-2 rounded-lg ${
              formattedRide?.required_gender === 'ذكر' 
                ? 'bg-blue-50 border border-blue-200' 
                : formattedRide?.required_gender === 'أنثى'
                ? 'bg-pink-50 border border-pink-200'
                : 'bg-gray-50 border border-gray-200'
            }`}>
              <MaterialIcons 
                name={formattedRide?.required_gender === 'ذكر' ? 'male' : formattedRide?.required_gender === 'أنثى' ? 'female' : 'people'} 
                size={20} 
                color={formattedRide?.required_gender === 'ذكر' ? '#2563EB' : formattedRide?.required_gender === 'أنثى' ? '#DB2777' : '#6B7280'} 
                className={language === 'ar' ? 'ml-2' : 'mr-2'} 
              />
              <Text className={`font-CairoBold mt-2 text-sm ${
                formattedRide?.required_gender === 'ذكر' 
                  ? 'text-blue-600' 
                  : formattedRide?.required_gender === 'أنثى'
                  ? 'text-pink-600'
                  : 'text-gray-600'
              }`}>
                {formattedRide?.required_gender === 'ذكر' 
                  ? (language === 'ar' ? 'ذكور فقط' : 'Males only')
                  : formattedRide?.required_gender === 'أنثى'
                  ? (language === 'ar' ? 'إناث فقط' : 'Females only')
                  : (language === 'ar' ? 'جميع الجنسيات' : 'All genders')}
              </Text>
            </View>

            <View className={`flex-row items-center px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <MaterialIcons 
                name="event" 
                size={20} 
                color="#F97316" 
                className={language === 'ar' ? 'ml-2' : 'mr-2'} 
              />
              <Text className="font-CairoBold mt-2 text-sm text-orange-600">
                {formattedRide?.is_recurring ? (
                  formattedRide.ride_days?.map((day, index) => (
                    `${day}${index < (formattedRide.ride_days?.length || 0) - 1 ? '، ' : ''}`
                  ))
                ) : (
                  (() => {
                    const date = parse(formattedRide?.formattedDateTime?.date || '', 'dd/MM/yyyy', new Date());
                    const days = language === 'ar' 
                      ? ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
                      : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                    return days[date.getDay()];
                  })()
                )}
              </Text>
            </View>
          </View>

          <Text className={`text-lg font-CairoBold mt-2 mb-4 text-black ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'تفضيلات الرحلة' : 'Ride Preferences'}
          </Text>
          <View className={`flex-row flex-wrap gap-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            {formattedRide?.no_smoking && (
              <View className={`flex-1 min-w-[140px] flex-row items-center px-4 py-3 rounded-xl bg-red-50 border border-red-100 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <MaterialIcons
                  name="smoke-free"
                  size={22}
                  color="#DC2626"
                  className={language === 'ar' ? 'ml-3' : 'mr-3'}
                />
                <Text className={`text-red-600 font-CairoBold pt-1.5 text-sm ${language === 'ar' ? 'ml-2 pr-1' : 'mr-2 pl-1'}`}>
                  {language === 'ar' ? 'ممنوع التدخين' : 'No smoking'}
                </Text>
              </View>
            )}
            {formattedRide?.no_music && (
              <View className={`flex-1 min-w-[140px] flex-row items-center px-4 py-3 rounded-xl bg-red-50 border border-red-100 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <MaterialIcons
                  name="music-off"
                  size={22}
                  color="#DC2626"
                  className={language === 'ar' ? 'ml-3' : 'mr-3'}
                />
                <Text className={`text-red-600 font-CairoBold pt-1.5 text-sm ${language === 'ar' ? 'ml-2 pr-1' : 'mr-2 pl-1'}`}>
                  {language === 'ar' ? 'ممنوع الموسيقى' : 'No music'}
                </Text>
              </View>
            )}
            {formattedRide?.no_children && (
              <View className={`flex-1 min-w-[140px] flex-row items-center px-4 py-3 rounded-xl bg-red-50 border border-red-100 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <MaterialIcons
                  name="child-care"
                  size={22}
                  color="#DC2626"
                  className={language === 'ar' ? 'ml-3' : 'mr-3'}
                />
                <Text className={`text-red-600 font-CairoBold pt-1.5 text-sm ${language === 'ar' ? 'ml-2 pr-1' : 'mr-2 pl-1'}`}>
                  {language === 'ar' ? 'ممنوع الأطفال' : 'No children'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    ),
    [formattedRide, allPassengers, isDriver, language, calculateTotalSeatsTaken]
  );

  // Render current passengers
  const renderCurrentPassengers = useCallback(
    () => (
      <View
        className="bg-white w-[98%] mx-1 mt-3 p-4 rounded-xl"
        style={Platform.OS === 'android' ? styles.androidShadow : styles.iosShadow}
      >
        <View className={`flex-row justify-between items-center mb-3 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
          <Text className={`text-lg font-CairoBold text-black ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'الركاب الحاليين' : 'Current Passengers'}
          </Text>
          {isDriver && (
            <TouchableOpacity
              onPress={() => router.push({
                pathname: '/ride-requests',
                params: {
                  rideId: ride?.id,
                  driverId: ride?.driver_id,
                  origin: ride?.origin_address,
                  destination: ride?.destination_address,
                  rideTime: ride?.ride_datetime,
                  availableSeats: ride?.available_seats?.toString(),
                  requiredGender: ride?.required_gender,
                  noSmoking: ride?.no_smoking?.toString(),
                  noMusic: ride?.no_music?.toString(),
                  noChildren: ride?.no_children?.toString()
                }
              })}
              className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <Text className={`text-orange-500 font-CairoBold ${language === 'ar' ? 'ml-1' : 'mr-1'}`}>
                  {language === 'ar' ? 'طلبات الحجز' : 'Booking Requests'}
                </Text>
                {pendingRequestsCount > 0 && (
                  <View className="bg-orange-500 rounded-full w-6 h-6 pt-1 items-center justify-center">
                    <Text className="text-white font-CairoBold text-sm">{pendingRequestsCount}</Text>
                  </View>
                )}
              </View>
              <MaterialIcons 
                name={language === 'ar' ? "chevron-left" : "chevron-right"} 
                size={20} 
                color="#f97316" 
              />
            </TouchableOpacity>
          )}
        </View>
        {allPassengers.length > 0 ? (
          <View className="border border-gray-200 rounded-lg overflow-hidden">
            <View className={`flex-row bg-gray-50 p-3 border-b border-gray-200 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <View className="flex-1">
                <Text className={`text-sm font-CairoBold text-gray-700 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'الاسم' : 'Name'}
                </Text>
              </View>
              <View className="w-24">
                <Text className={`text-sm font-CairoBold text-gray-700 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'المقاعد' : 'Seats'}
                </Text>
              </View>
              <View className="w-49">
                <Text className={`text-sm font-CairoBold text-gray-700 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'نقطة التوقف' : 'Stop Point'}
                </Text>
              </View>
            </View>
            {allPassengers.map((passenger) => (
              <View key={passenger.id} className={`flex-row p-3 border-b border-gray-100 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <View className={`flex-1 flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <Image
                    source={icons.person}
                    className={`w-5 h-5 ${language === 'ar' ? 'ml-2' : 'mr-2'}`}
                    tintColor="#10B981"
                  />
                  <Text className={`text-sm pt-1.5 text-gray-700 font-CairoRegular ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {passengerNames[passenger.user_id] || (language === 'ar' ? 'الراكب' : 'Passenger')}
                  </Text>
                </View>
                <View className="w-20 justify-center">
                  <Text className={`text-sm pt-1.5 text-gray-700 font-CairoRegular ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {passenger.requested_seats || 1} {passenger.requested_seats === 1 ? t.seat : t.seats}
                  </Text>
                </View>
                <View className="w-49 justify-center">
                  <Text className={`text-sm pt-1.5 text-gray-700 font-CairoRegular ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {passenger.selected_waypoint ? (
                      <>
                        {passenger.selected_waypoint.address === ride?.origin_address ? (
                          language === 'ar' ? 'نقطة البداية' : 'Starting Point'
                        ) : ride?.waypoints?.findIndex(
                          wp => wp.address === passenger.selected_waypoint?.address
                        ) !== -1 ? (
                          <Text className="text-gray-500 text-lg mt-1">
                            {passenger.selected_waypoint.address}
                          </Text>
                        ) : (
                          language === 'ar' ? 'نقطة البداية' : 'Starting Point'
                        )}
                      </>
                    ) : (
                      language === 'ar' ? 'نقطة البداية' : 'Starting Point'
                    )}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View className="bg-gray-50 p-4 rounded-xl">
            <Text className={`text-base text-gray-700 text-center font-CairoBold ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {language === 'ar' ? 'لا يوجد ركاب حالياً' : 'No passengers at the moment'}
            </Text>
          </View>
        )}
      </View>
    ),
    [allPassengers, passengerNames, ride, isDriver, pendingRequestsCount, language, t.seat, t.seats]
  );

  // Add these new functions after the existing handle functions
  const handleStartRide = async () => {
    try {
      if (Platform.OS === 'android') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (!ride || !ride.id) {
        showAlert({
          title: language === 'ar' ? "خطأ" : "Error",
          message: language === 'ar' ? "معلومات الرحلة غير مكتملة" : "Ride information is incomplete",
          type: 'error'
        });
        return;
      }

      showAlert({
        title: language === 'ar' ? "جاري بدء الرحلة" : "Starting Ride",
        message: language === 'ar' ? "جاري بدء الرحلة..." : "Starting the ride...",
        type: 'info',
        isLoading: true
      });

      const currentStatus = ride.status;

      setRide(prevRide => prevRide ? { ...prevRide, status: 'in-progress' } : null);

      await updateDoc(doc(db, 'rides', ride.id), {
        status: 'in-progress',
        updated_at: serverTimestamp(),
      });

      for (const passenger of allPassengers) {
        await sendRideStatusNotification(
          passenger.user_id,
          'بدأت الرحلة!',
          `بدأ السائق رحلتك من ${ride.origin_address} إلى ${ride.destination_address}`,
          ride.id
        );
      }

      showAlert({
        title: language === 'ar' ? "تم بدء الرحلة" : "Ride Started",
        message: language === 'ar' ? "تم بدء الرحلة بنجاح" : "Ride started successfully",
        type: 'success'
      });
    } catch (error) {
      if (ride) {
        setRide(prevRide => prevRide ? { ...prevRide, status: ride.status } : null);
      }
      console.error('Error starting ride:', error);
      showAlert({
        title: language === 'ar' ? "خطأ" : "Error",
        message: language === 'ar' ? "حدث خطأ أثناء بدء الرحلة" : "An error occurred while starting the ride",
        type: 'error'
      });
    }
  };

  const handleFinishRide = async () => {
    try {
      if (Platform.OS === 'android') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (!ride || !ride.id) {
        showAlert({
          title: language === 'ar' ? "خطأ" : "Error",
          message: language === 'ar' ? "معلومات الرحلة غير مكتملة" : "Ride information is incomplete",
          type: 'error'
        });
        return;
      }

      showAlert({
        title: language === 'ar' ? "جاري إنهاء الرحلة" : "Finishing Ride",
        message: language === 'ar' ? "جاري إنهاء الرحلة..." : "Finishing the ride...",
        type: 'info',
        isLoading: true
      });

      await updateDoc(doc(db, 'rides', ride.id), {
        status: 'completed',
        updated_at: serverTimestamp(),
      });

      setRide(prevRide => prevRide ? { ...prevRide, status: 'completed' } : null);

      for (const passenger of allPassengers) {
        await sendRideStatusNotification(
          passenger.user_id,
          'تم إنهاء الرحلة!',
          `تم إنهاء رحلتك من ${ride.origin_address} إلى ${ride.destination_address}`,
          ride.id
        );
      }

      if (ride.is_recurring) {
        showAlert({
          title: language === 'ar' ? "رحلة متكررة" : "Recurring Ride",
          message: language === 'ar' ? "هل تريد تكرار هذه الرحلة للأسبوع القادم؟" : "Do you want to repeat this ride for next week?",
          type: 'info',
          showCancel: true,
          confirmText: language === 'ar' ? "نعم" : "Yes",
          cancelText: language === 'ar' ? "لا" : "No",
          onConfirm: async () => {
            try {
              showAlert({
                title: language === 'ar' ? "جاري إنشاء الرحلة" : "Creating Ride",
                message: language === 'ar' ? "جاري إنشاء الرحلة الجديدة..." : "Creating new ride...",
                type: 'info',
                isLoading: true
              });

              const currentRideDate = parse(ride.ride_datetime, DATE_FORMAT, new Date());
              const nextWeekDate = new Date(currentRideDate);
              nextWeekDate.setDate(nextWeekDate.getDate() + 7);
              const nextWeekDateTime = format(nextWeekDate, DATE_FORMAT);

              const ridesRef = collection(db, 'rides');
              const q = query(ridesRef, orderBy('ride_number', 'desc'), limit(1));
              const querySnapshot = await getDocs(q);
              const highestRide = querySnapshot.docs[0];
              const nextRideNumber = highestRide ? highestRide.data().ride_number + 1 : 1;

              const newRideId = `(${ride.ride_number})`;
              await setDoc(doc(db, 'rides', newRideId), {
                origin_address: ride.origin_address,
                destination_address: ride.destination_address,
                origin_latitude: ride.origin_latitude,
                origin_longitude: ride.origin_longitude,
                destination_latitude: ride.destination_latitude,
                destination_longitude: ride.destination_longitude,
                ride_datetime: nextWeekDateTime,
                driver_id: ride.driver_id,
                status: 'available',
                available_seats: ride.driver?.car_seats || DEFAULT_CAR_SEATS,
                is_recurring: true,
                no_children: ride.no_children,
                no_music: ride.no_music,
                no_smoking: ride.no_smoking,
                required_gender: ride.required_gender,
                ride_days: ride.ride_days,
                ride_number: nextRideNumber,
                created_at: serverTimestamp(),
              });

              await sendRideStatusNotification(
                ride.driver_id || '',
                'تم إنشاء رحلة جديدة',
                `تم إنشاء رحلة جديدة للأسبوع القادم من ${ride.origin_address} إلى ${ride.destination_address}`,
                newRideId
              );

              for (const passenger of allPassengers) {
                const notificationId = await schedulePassengerRideReminder(
                  newRideId,
                  nextWeekDateTime,
                  ride.origin_address,
                  ride.destination_address,
                  ride.driver?.name || DEFAULT_DRIVER_NAME
                );

                await sendRideStatusNotification(
                  passenger.user_id,
                  'رحلة جديدة للأسبوع القادم!',
                  `تم إنشاء رحلة جديدة للأسبوع القادم من ${ride.origin_address} إلى ${ride.destination_address}. سيتم تذكيرك قبل الرحلة.`,
                  newRideId
                );

                await addDoc(collection(db, 'ride_requests'), {
                  ride_id: newRideId,
                  user_id: passenger.user_id,
                  driver_id: ride.driver_id,
                  status: 'waiting',
                  created_at: serverTimestamp(),
                  passenger_name: passengerNames[passenger.user_id] || 'الراكب',
                  notification_id: notificationId,
                  selected_waypoint: passenger.selected_waypoint
                });
              }

              showAlert({
                title: language === 'ar' ? "تم إنشاء الرحلة" : "Ride Created",
                message: language === 'ar' ? "تم إنشاء رحلة جديدة للأسبوع القادم بنفس التفاصيل وتم إخطار جميع الركاب" : "New ride created for next week with the same details and all passengers have been notified",
                type: 'success'
              });
            } catch (error) {
              console.error('Error creating next week ride:', error);
              showAlert({
                title: language === 'ar' ? "خطأ" : "Error",
                message: language === 'ar' ? "حدث خطأ أثناء إنشاء الرحلة الجديدة" : "An error occurred while creating the new ride",
                type: 'error'
              });
            }
          }
        });
      } else {
        showAlert({
          title: language === 'ar' ? "تم إنهاء الرحلة" : "Ride Finished",
          message: language === 'ar' ? "تم إنهاء الرحلة بنجاح" : "Ride finished successfully",
          type: 'success'
        });
      }
    } catch (error) {
      console.error('Error finishing ride:', error);
      showAlert({
        title: language === 'ar' ? "خطأ" : "Error",
        message: language === 'ar' ? "حدث خطأ أثناء إنهاء الرحلة" : "An error occurred while finishing the ride",
        type: 'error'
      });
    }
  };

  const handleCancelRideByDriver = async () => {
    try {
      if (Platform.OS === 'android') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (!ride || !ride.id) {
        showAlert({
          title: language === 'ar' ? "خطأ" : "Error",
          message: language === 'ar' ? "معلومات الرحلة غير مكتملة" : "Ride information is incomplete",
          type: 'error'
        });
        return;
      }

      showAlert({
        title: language === 'ar' ? "تأكيد الإلغاء" : "Confirm Cancellation",
        message: language === 'ar' ? "هل أنت متأكد من إلغاء الرحلة؟" : "Are you sure you want to cancel the ride?",
        type: 'warning',
        showCancel: true,
        confirmText: language === 'ar' ? "نعم" : "Yes",
        cancelText: language === 'ar' ? "لا" : "No",
        onConfirm: async () => {
          showAlert({
            title: language === 'ar' ? "جاري الإلغاء" : "Cancelling",
            message: language === 'ar' ? "جاري إلغاء الرحلة..." : "Cancelling the ride...",
            type: 'info',
            isLoading: true
          });

          await updateDoc(doc(db, 'rides', ride.id), {
            status: 'cancelled',
            updated_at: serverTimestamp(),
          });

          for (const passenger of allPassengers) {
            await sendRideStatusNotification(
              passenger.user_id,
              'تم إلغاء الرحلة',
              `تم إلغاء رحلتك من ${ride.origin_address} إلى ${ride.destination_address}`,
              ride.id
            );
          }

          showAlert({
            title: language === 'ar' ? "تم الإلغاء" : "Cancelled",
            message: language === 'ar' ? "تم إلغاء الرحلة بنجاح" : "Ride cancelled successfully",
            type: 'success'
          });
        }
      });
    } catch (error) {
      console.error('Error cancelling ride:', error);
      showAlert({
        title: language === 'ar' ? "خطأ" : "Error",
        message: language === 'ar' ? "حدث خطأ أثناء إلغاء الرحلة" : "An error occurred while cancelling the ride",
        type: 'error'
      });
    }
  };

  // Modify the renderActionButtons function to remove on-hold status
  const renderActionButtons = useCallback(() => {
    if (isDriver) {
      // Check if ride is full
      if (ride?.available_seats === 0 && ride.status === 'available') {
        updateDoc(doc(db, 'rides', ride.id), {
          status: 'full',
          updated_at: serverTimestamp(),
        });
      }

      switch (ride?.status) {
        case 'available':
        case 'full':
          return (
            <View className="p-4 m-3">
              {isRideTime ? (
                <CustomButton
                  title={language === 'ar' ? "بدء الرحلة" : "Start Ride"}
                  onPress={handleStartRide}
                  className="bg-blue-500 py-3 rounded-xl mb-3"
                />
              ) : (
                <View className="mb-3">
                  <CustomButton
                    title={language === 'ar' ? "بدء الرحلة" : "Start Ride"}
                    onPress={handleStartRide}
                    className="bg-gray-400 py-3 rounded-xl"
                    disabled={true}
                  />
                  <Text className={`text-center text-sm text-gray-500 mt-2 font-CairoRegular ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {(() => {
                      const [datePart, timePart] = ride?.ride_datetime?.split(' ') || ['', ''];
                      return language === 'ar' 
                        ? `يمكن بدء الرحلة في ${timePart} بتاريخ ${datePart}`
                        : `Ride can be started at ${timePart} on ${datePart}`;
                    })()}
                  </Text>
                </View>
              )}
              <CustomButton
                title={language === 'ar' ? "إلغاء الرحلة" : "Cancel Ride"}
                onPress={handleCancelRideByDriver}
                className="bg-red-500 py-3 rounded-xl"
              />
            </View>
          );
        case 'in-progress':
          return (
            <View className="p-4 m-3">
              <CustomButton
                title={language === 'ar' ? "إنهاء الرحلة" : "Finish Ride"}
                onPress={handleFinishRide}
                className="bg-green-500 py-3 rounded-xl"
              />
            </View>
          );
        case 'completed':
          return (
            <View className="p-4 m-3 bg-green-100 items-center rounded-xl">
              <View className={`flex-row items-center justify-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <MaterialIcons name="check-circle" size={24} color="#10B981" />
                <Text className={`text-green-700 font-CairoBold mt-1 text-lg ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
                  {language === 'ar' ? 'تم إكمال الرحلة بنجاح' : 'Ride completed successfully'}
                </Text>
              </View>
            </View>
          );
          case 'cancelled':
          return (
            <View className="p-4 m-3 bg-red-100 items-center rounded-xl">
              <View className={`flex-row items-center justify-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <MaterialIcons name="cancel" size={24} color="#ff0000" />
                <Text className={`text-red-600 font-CairoBold mt-1 text-lg ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
                  {language === 'ar' ? 'تم الغاء الرحلة ' : 'Ride Cancelled'}
                </Text>
              </View>
            </View>
          );
        default:
          return null;
      }
    } else {
      // Passenger buttons
      if (!rideRequest) {
        // Show book button if ride is available or full
        if (ride?.status === 'available' || ride?.status === 'full') {
          return (
            <View className="p-4 m-3">
              <CustomButton
                title={ride.available_seats > 0 
                  ? (language === 'ar' ? "طلب حجز الرحلة" : "Book Ride")
                  : (language === 'ar' ? "طلب حجز (قائمة الانتظار)" : "Book (Waitlist)")
                }
                onPress={handleBookRide}
                className={`${ride.available_seats > 0 ? "bg-orange-500" : "bg-yellow-500"} py-3 rounded-xl`}
              />
            </View>
          );
        } else if (ride?.status === 'in-progress') {
          return (
            <View className="p-4 m-3 bg-blue-100 rounded-xl">
              <Text className={`text-blue-800 font-CairoBold text-center text-lg ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'الرحلة جارية حالياً - لا يمكن حجز مقعد' : 'Ride is in progress - Cannot book a seat'}
              </Text>
            </View>
          );
        } else if (ride?.status === 'completed') {
          return (
            <View className="p-4 m-3 bg-green-50 rounded-xl">
              <Text className={`text-gray-700 font-CairoBold text-center text-lg ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'تم إكمال الرحلة' : 'Ride completed'}
              </Text>
            </View>
          );
        } else if (ride?.status === 'cancelled') {
          return (
            <View className="p-4 m-3 bg-gray-100 rounded-xl">
              <Text className={`text-gray-700 font-CairoBold text-center text-lg ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'تم إلغاء الرحلة' : 'Ride cancelled'}
              </Text>
            </View>
          );
        }
      } else {
        // Show different buttons based on request status
        switch (rideRequest.status) {
          case 'waiting':
            return (
              <View className="p-4 m-3">
                <View className="bg-yellow-100 p-4 rounded-xl mb-3">
                  <Text className={`text-yellow-800 font-CairoBold text-center text-lg ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {rideRequest.is_waitlist 
                      ? (language === 'ar' ? 'في قائمة الانتظار - سيتم إخطارك عند توفر مقعد' : 'On waitlist - You will be notified when a seat is available')
                      : (language === 'ar' ? 'في انتظار موافقة السائق' : 'Waiting for driver approval')
                    }
                  </Text>
                </View>
                <CustomButton
                  title={language === 'ar' ? "إلغاء طلب الحجز" : "Cancel Booking Request"}
                  onPress={handleCancelRide}
                  className="bg-red-500 py-3 rounded-xl"
                />
              </View>
            );
          case 'accepted':
            return (
              <View className="p-4 m-3">
                <CustomButton
                  title={language === 'ar' ? "تسجيل الدخول" : "Check In"}
                  onPress={handleCheckIn}
                  className="bg-green-500 py-3 rounded-xl mb-3"
                />
                <CustomButton
                  title={language === 'ar' ? "إلغاء الحجز" : "Cancel Booking"}
                  onPress={handleCancelRide}
                  className="bg-red-500 py-3 rounded-xl"
                />
              </View>
            );
          case 'checked_in':
            return (
              <View className="p-4 m-3">
                <CustomButton
                  title={language === 'ar' ? "تسجيل الخروج" : "Check Out"}
                  onPress={handleCheckOut}
                  className="bg-orange-500 py-3 rounded-xl"
                />
              </View>
            );
          case 'checked_out':
            return (
              <View className="p-4 m-3 bg-green-100 items-center rounded-xl">
                <Text className={`text-gray-700 font-CairoBold text-center text-lg ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'تم إكمال الرحلة' : 'Ride completed'}
                </Text>
              </View>
            );
          case 'rejected':
            return (
              <View className="p-4 m-3 bg-gray-100 rounded-xl">
                <Text className={`text-gray-700 font-CairoBold text-center text-lg ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'تم رفض طلب الحجز' : 'Booking request rejected'}
                </Text>
              </View>
            );
          case 'cancelled':
            return (
              <View className="p-4 m-3 bg-gray-100 rounded-xl">
                <Text className={`text-gray-700 font-CairoBold text-center text-lg ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'تم إلغاء الحجز' : 'Booking cancelled'}
                </Text>
              </View>
            );
          default:
            return null;
        }
      }
    }
  }, [isDriver, ride, rideRequest, allPassengers, isRideTime, language]);

  useEffect(() => {
    fetchRideDetails();
  }, [fetchRideDetails]);

  // Replace the existing Rating Modal with this new one
  const renderRatingModal = () => (
    <Modal
      visible={showRatingModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowRatingModal(false)}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}>
        <ScrollView className="w-[90%] max-h-[80%]">
          <View className="bg-white p-6 rounded-2xl">
            {/* Header */}
            <View className="items-center mb-6">
              <MaterialIcons name="star" size={40} color="#f97316" />
              <Text className="text-2xl font-CairoBold mt-2 text-center text-gray-800">قيّم رحلتك</Text>
              <Text className="text-sm font-CairoRegular mt-1 text-center text-gray-500">ساعدنا في تحسين خدمتنا</Text>
            </View>

            {/* Rating Categories */}
            <View className="space-y-6">
              {/* Overall Rating */}
              <View className="bg-gray-50 p-4 rounded-xl">
                <Text className="text-lg font-CairoBold mb-3 text-right text-gray-800">التقييم العام</Text>
                <View className="py-2">
                  <AirbnbRating
                    reviewColor="#F79824"
                    showRating={true}
                    onFinishRating={(value: number) => setRating(prev => ({ ...prev, overall: value }))}
                    size={35}
                    defaultRating={rating.overall}
                    selectedColor="#F79824"
                  />
                </View>
              </View>

              {/* Driving Rating */}
              <View className="bg-gray-50 p-4 rounded-xl">
                <View className="flex-row-reverse items-center justify-between mb-3">
                  <Text className="text-lg font-CairoBold text-gray-800">قيادة السيارة</Text>
                  <MaterialIcons name="directions-car" size={24} color="#f97316" />
                </View>
                <View className="py-2">
                  <AirbnbRating
                    reviewColor="#F79824"
                    showRating={true}
                    onFinishRating={(value: number) => setRating(prev => ({ ...prev, driving: value }))}
                    size={35}
                    defaultRating={rating.driving}
                    selectedColor="#F79824"
                  />
                </View>
              </View>

              {/* Behavior Rating */}
              <View className="bg-gray-50 p-4 rounded-xl">
                <View className="flex-row-reverse items-center justify-between mb-3">
                  <Text className="text-lg font-CairoBold text-gray-800">الأخلاق والسلوك</Text>
                  <MaterialIcons name="people" size={24} color="#f97316" />
                </View>
                <View className="py-2">
                  <AirbnbRating
                    reviewColor="#F79824"
                    showRating={true}
                    onFinishRating={(value: number) => setRating(prev => ({ ...prev, behavior: value }))}
                    size={35}
                    defaultRating={rating.behavior}
                    selectedColor="#F79824"
                  />
                </View>
              </View>

              {/* Punctuality Rating */}
              <View className="bg-gray-50 p-4 rounded-xl">
                <View className="flex-row-reverse items-center justify-between mb-3">
                  <Text className="text-lg font-CairoBold text-gray-800">الالتزام بالمواعيد</Text>
                  <MaterialIcons name="access-time" size={24} color="#f97316" />
                </View>
                <View className="py-2">
                  <AirbnbRating
                    reviewColor="#F79824"
                    showRating={true}
                    onFinishRating={(value: number) => setRating(prev => ({ ...prev, punctuality: value }))}
                    size={35}
                    defaultRating={rating.punctuality}
                    selectedColor="#F79824"
                  />
                </View>
              </View>

              {/* Cleanliness Rating */}
              <View className="bg-gray-50 p-4 rounded-xl">
                <View className="flex-row-reverse items-center justify-between mb-3">
                  <Text className="text-lg font-CairoBold text-gray-800">نظافة السيارة</Text>
                  <MaterialIcons name="cleaning-services" size={24} color="#f97316" />
                </View>
                <View className="py-2">
                  <AirbnbRating
                    reviewColor="#F79824"
                    showRating={true}
                    onFinishRating={(value: number) => setRating(prev => ({ ...prev, cleanliness: value }))}
                    size={35}
                    defaultRating={rating.cleanliness}
                    selectedColor="#F79824"
                  />
                </View>
              </View>

              {/* Comment Input */}
              <View className="bg-gray-50 p-4 rounded-xl">
                <View className="flex-row-reverse items-center justify-between mb-3">
                  <Text className="text-lg font-CairoBold text-gray-800">تعليقك (اختياري)</Text>
                  <MaterialIcons name="comment" size={24} color="#f97316" />
                </View>
                <TextInput
                  className="border border-gray-200 rounded-xl p-3 text-right bg-white"
                  multiline
                  numberOfLines={3}
                  placeholder="اكتب تعليقك هنا..."
                  placeholderTextColor="#9CA3AF"
                  value={rating.comment}
                  onChangeText={(text) => setRating(prev => ({ ...prev, comment: text }))}
                  style={{ textAlignVertical: 'top' }}
                />
              </View>
            </View>

            {/* Buttons */}
            <View className="flex-row justify-between mt-6 space-x-3">
              <CustomButton
                title="إرسال التقييم"
                onPress={handleRateDriver}
                className="flex-1 bg-orange-500 py-3 rounded-xl"
                icon={<MaterialIcons name="send" size={20} color="white" />}
              />
              <CustomButton
                title="إلغاء"
                onPress={() => setShowRatingModal(false)}
                className="flex-1 bg-gray-500 py-3 rounded-xl"
                icon={<MaterialIcons name="close" size={20} color="white" />}
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );

  // Add the waypoint selection modal component
  const renderWaypointModal = () => (
    <Modal
      visible={showWaypointModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowWaypointModal(false)}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}>
        <View className="bg-white w-[90%] rounded-2xl p-6">
          <Text className="text-2xl font-CairoBold mb-4 text-center text-gray-800">اختر نقطة التوقف</Text>
          <Text className="text-base font-CairoRegular mb-6 text-center text-gray-600">
            اختر أقرب نقطة توقف لك
          </Text>

          <ScrollView className="max-h-[60%]">
            <View className="space-y-3">
              {/* Origin point */}
              <TouchableOpacity
                onPress={() => {
                  const originWaypoint = {
                    latitude: ride?.origin_latitude || 0,
                    longitude: ride?.origin_longitude || 0,
                    address: ride?.origin_address || '',
                    street: ride?.origin_street || ''
                  };
                  setSelectedWaypoint(originWaypoint);
                  setShowWaypointModal(false);
                  handleBookRideWithWaypoint(originWaypoint);
                }}
                className={`p-4 rounded-xl border ${
                  selectedWaypoint?.address === ride?.origin_address
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <View className="flex-row-reverse items-center">
                  <MaterialIcons
                    name="location-on"
                    size={24}
                    color={selectedWaypoint?.address === ride?.origin_address ? '#f97316' : '#6B7280'}
                  />
                  <View className="mr-2 flex-1">
                    <Text className={`text-base font-CairoMedium ${
                      selectedWaypoint?.address === ride?.origin_address ? 'text-orange-600' : 'text-gray-700'
                    }`}>
                      {ride?.origin_address}
                    </Text>
                    {ride?.origin_street && (
                      <Text className={`text-sm font-CairoRegular mt-1 ${
                        selectedWaypoint?.address === ride?.origin_address ? 'text-orange-500' : 'text-gray-500'
                      }`}>
                        {ride.origin_street}
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>

              {/* Waypoints */}
              {ride?.waypoints?.map((waypoint, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => {
                    setSelectedWaypoint(waypoint);
                    setShowWaypointModal(false);
                    handleBookRideWithWaypoint(waypoint);
                  }}
                  className={`p-4 rounded-xl border ${
                    selectedWaypoint?.address === waypoint.address
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <View className="flex-row-reverse items-center">
                    <MaterialIcons
                      name="location-on"
                      size={24}
                      color={selectedWaypoint?.address === waypoint.address ? '#f97316' : '#6B7280'}
                    />
                    <View className="mr-2 flex-1">
                      <Text className={`text-base font-CairoMedium ${
                        selectedWaypoint?.address === waypoint.address ? 'text-orange-600' : 'text-gray-700'
                      }`}>
                        {waypoint.address}
                      </Text>
                      {waypoint.street && (
                        <Text className={`text-sm font-CairoRegular mt-1 ${
                          selectedWaypoint?.address === waypoint.address ? 'text-orange-500' : 'text-gray-500'
                        }`}>
                          {waypoint.street}
                        </Text>
                      )}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity
            onPress={() => setShowWaypointModal(false)}
            className="mt-4 bg-gray-200 py-3 rounded-xl"
          >
            <Text className="text-center text-gray-700 font-CairoBold">إلغاء</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // Add this function to check if current time is within 15 minutes of ride time
  const checkRideTime = (rideDateTime: string) => {
    console.log('Checking ride time for:', rideDateTime);
    const [datePart, timePart] = rideDateTime.split(' ');
    const [day, month, year] = datePart.split('/').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    const rideDate = new Date(year, month - 1, day, hour, minute);
    const currentDate = new Date();
    
    console.log('Ride date:', rideDate);
    console.log('Current date:', currentDate);
    
    // Allow starting the ride if current time is at or after the scheduled time
    const canStart = currentDate >= rideDate;
    console.log('Can start ride:', canStart);
    return canStart;
  };

  // Add useEffect to update isRideTime when ride data changes
  useEffect(() => {
    if (ride?.ride_datetime) {
      const isTime = checkRideTime(ride.ride_datetime);
      console.log('Ride datetime:', ride.ride_datetime);
      console.log('Is ride time:', isTime);
      setIsRideTime(isTime);
    }
  }, [ride?.ride_datetime]);

  // Update the seat selection modal component
  const renderSeatModal = () => {
    const translateY = modalAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [300, 0]
    });

    const opacity = modalAnimation.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1]
    });

    return (
      <Modal
        visible={showSeatModal}
        transparent={true}
        animationType="none"
        onRequestClose={() => {
          animateModal(false);
          setTimeout(() => setShowSeatModal(false), 200);
        }}
        onShow={() => animateModal(true)}
      >
        <Animated.View 
          style={[
            { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
            { opacity }
          ]}
          className="justify-end"
        >
          <Animated.View 
            style={[
              { transform: [{ translateY }] },
              { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24 }
            ]}
          >
            <LinearGradient
              colors={['#fff', '#f8f9fa']}
              className="p-6 rounded-t-3xl"
            >
              {/* Header */}
              <View className="items-center mb-6">
                <View className="w-12 h-1 bg-gray-300 rounded-full mb-4" />
                <Text className="text-2xl font-CairoBold text-gray-800">
                  {language === 'ar' ? 'اختر عدد المقاعد' : 'Select Number of Seats'}
                </Text>
                <Text className="text-sm text-gray-500 mt-1">
                  {language === 'ar' ? 'حدد عدد المقاعد التي تريد حجزها' : 'Choose how many seats you want to book'}
                </Text>
              </View>

              {/* Seat Counter */}
              <View className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
                <View className="flex-row justify-between items-center">
                  <TouchableOpacity
                    onPress={() => {
                      if (Platform.OS === 'android') {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                      setSelectedSeats(Math.max(1, selectedSeats - 1));
                    }}
                    className="bg-gray-100 p-4 rounded-full"
                  >
                    <MaterialIcons name="remove" size={24} color="#f97316" />
                  </TouchableOpacity>

                  <View className="items-center">
                    <Text className="text-2xl font-CairoBold text-gray-800 mt-4">
                      {selectedSeats}
                    </Text>
                    <Text className="text-sm text-gray-500">
                      {language === 'ar' ? 'مقاعد' : 'Seats'}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => {
                      if (Platform.OS === 'android') {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                      setSelectedSeats(Math.min(ride?.available_seats || 1, selectedSeats + 1));
                    }}
                    className="bg-gray-100 p-4 rounded-full"
                  >
                    <MaterialIcons name="add" size={24} color="#f97316" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Available Seats Info */}
              <View className="bg-orange-50 rounded-xl p-4 mb-6">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center">
                    <MaterialIcons name="event-seat" size={24} color="#f97316" />
                    <Text className="text-orange-800 font-CairoMedium mr-2">
                      {language === 'ar' ? 'المقاعد المتاحة:' : 'Available seats:'}
                    </Text>
                  </View>
                  <Text className="text-orange-800 font-CairoBold text-lg">
                    {ride?.available_seats}
                  </Text>
                </View>
              </View>

              {/* Buttons */}
              <View className="flex-row space-x-3">
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === 'android') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }
                    animateModal(false);
                    setTimeout(() => {
                      setShowSeatModal(false);
                      handleBookRideWithSeats(selectedSeats);
                    }, 200);
                  }}
                  className="flex-1 bg-orange-500 py-4 rounded-xl"
                >
                  <Text className="text-white font-CairoBold text-center text-lg">
                    {language === 'ar' ? 'تأكيد' : 'Confirm'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === 'android') {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }
                    animateModal(false);
                    setTimeout(() => setShowSeatModal(false), 200);
                  }}
                  className="flex-1 bg-gray-200 py-4 rounded-xl"
                >
                  <Text className="text-gray-700 font-CairoBold text-center text-lg">
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      </Modal>
    );
  };

  const getStatusTranslation = (status: string) => {
    const statusMap: Record<string, string> = {
      'waiting': t.pending,
      'accepted': t.available,
      'rejected': t.ended,
      'checked_in': t.Active,
      'checked_out': t.ended,
      'cancelled': t.ended
    };
    return statusMap[status] || status;
  };

  const renderPassengerList = () => {
    return allPassengers.map((passenger) => (
      <View key={passenger.id} className="flex-row items-center justify-between p-4 bg-white rounded-lg mb-2">
        <View className="flex-1">
          <Text className="text-lg font-CairoBold text-gray-800">
            {passengerNames[passenger.id] || t.user}
          </Text>
          {passenger.selected_waypoint && (
            <Text className="text-sm font-CairoRegular text-gray-600 mt-1">
              {t.currentLocation}: {passenger.selected_waypoint.address}
            </Text>
          )}
        </View>
        <View className="flex-row items-center">
          <Text className={`text-sm font-CairoRegular mr-2 ${
            passenger.status === 'checked_in' ? 'text-green-600' :
            passenger.status === 'accepted' ? 'text-blue-600' :
            'text-gray-600'
          }`}>
            {getStatusTranslation(passenger.status)}
          </Text>
        </View>
      </View>
    ));
  };

  // Add new state for alert modal
  const [alertModal, setAlertModal] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info' as 'info' | 'warning' | 'error' | 'success',
    onConfirm: () => {},
    showCancel: false,
    confirmText: '',
    cancelText: '',
    isLoading: false
  });

  // Add showAlert function
  const showAlert = (config: {
    title: string;
    message: string;
    type?: 'info' | 'warning' | 'error' | 'success';
    onConfirm?: () => void;
    showCancel?: boolean;
    confirmText?: string;
    cancelText?: string;
    isLoading?: boolean;
  }) => {
    setAlertModal({
      visible: true,
      title: config.title,
      message: config.message,
      type: config.type || 'info',
      onConfirm: config.onConfirm || (() => setAlertModal(prev => ({ ...prev, visible: false }))),
      showCancel: config.showCancel || false,
      confirmText: config.confirmText || (language === 'ar' ? 'حسناً' : 'OK'),
      cancelText: config.cancelText || (language === 'ar' ? 'إلغاء' : 'Cancel'),
      isLoading: config.isLoading || false
    });
  };

  // Add renderAlertModal function
  const renderAlertModal = () => (
    <Modal
      visible={alertModal.visible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => !alertModal.isLoading && setAlertModal(prev => ({ ...prev, visible: false }))}
    >
      <View className="flex-1 justify-center items-center bg-black/50">
        <View className="bg-white w-[85%] rounded-2xl p-6">
          <View className="items-center mb-4">
            {alertModal.isLoading ? (
              <View className="w-16 h-16 bg-orange-100 rounded-full items-center justify-center mb-4">
                <ActivityIndicator size="large" color="#fff" />
              </View>
            ) : (
              <View className={`w-16 h-16 ${
                alertModal.type === 'success' ? 'bg-green-100' :
                alertModal.type === 'error' ? 'bg-red-100' :
                alertModal.type === 'warning' ? 'bg-orange-100' :
                'bg-blue-100'
              } rounded-full items-center justify-center mb-4`}>
                <MaterialIcons
                  name={
                    alertModal.type === 'success' ? 'check-circle' :
                    alertModal.type === 'error' ? 'error-outline' :
                    alertModal.type === 'warning' ? 'warning' :
                    'info'
                  }
                  size={40}
                  color={
                    alertModal.type === 'success' ? '#22c55e' :
                    alertModal.type === 'error' ? '#ef4444' :
                    alertModal.type === 'warning' ? '#fff' :
                    '#3b82f6'
                  }
                />
              </View>
            )}
            <Text className="text-xl font-CairoBold text-gray-800 text-center mb-2">
              {alertModal.title}
            </Text>
            <Text className="text-base text-gray-600 text-center font-CairoRegular">
              {alertModal.message}
            </Text>
          </View>
          {!alertModal.isLoading && (
            <View className="flex-row space-x-3">
              {alertModal.showCancel && (
                <TouchableOpacity
                  onPress={() => setAlertModal(prev => ({ ...prev, visible: false }))}
                  className="flex-1 bg-gray-200 py-3 rounded-xl"
                >
                  <Text className="text-gray-700 text-center font-CairoBold text-lg">
                    {alertModal.cancelText}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  alertModal.onConfirm();
                  setAlertModal(prev => ({ ...prev, visible: false }));
                }}
                className={`${alertModal.showCancel ? 'flex-1' : 'w-full'} bg-orange-500 py-3 rounded-xl`}
              >
                <Text className="text-white text-center font-CairoBold text-lg">
                  {alertModal.confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#f97316" />
        <Text className="mt-4 text-black font-CairoMedium">
          {language === 'ar' ? "جاري تحميل تفاصيل الرحلة..." : "Loading ride details..."}
            </Text>
          </View>
    );
  }

  if (error || !formattedRide) {
    return (
      <View className="flex-1 justify-center items-center p-4 bg-white">
        <MaterialIcons name="error-outline" size={48} color="#f97316" />
        <Text className="mt-4 text-black text-center font-CairoMedium">
          {error || (language === 'ar' ? 'الرحلة غير موجودة.' : 'Ride not found.')}
                </Text>
        <CustomButton
          title={language === 'ar' ? "إعادة المحاولة" : "Try Again"}
              onPress={() => {
            if (Platform.OS === 'android') {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
            fetchRideDetails();
          }}
          className="mt-4 bg-orange-500 py-3 px-6 rounded-xl"
        />
        <TouchableOpacity onPress={() => router.back()} className="mt-2">
          <Text className="text-blue-500 font-CairoMedium">
            {language === 'ar' ? "العودة" : "Back"}
              </Text>
            </TouchableOpacity>
          </View>
    );
  }

  return (
    <RideLayout
      title={language === 'ar' ? 'تفاصيل الرحلة' : 'Ride Details'}
      origin={ride ? { latitude: ride.origin_latitude, longitude: ride.origin_longitude } : undefined}
      destination={ride ? { latitude: ride.destination_latitude, longitude: ride.destination_longitude } : undefined}
      waypoints={ride?.waypoints}
      bottomSheetRef={bottomSheetRef}
      language={language}
    >
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={true}
      >
        {renderDriverInfo()}
        {renderRideDetails()}
        {isDriver && renderCurrentPassengers()}
        {renderActionButtons()}
      </ScrollView>

      {renderRatingModal()}
      {renderWaypointModal()}
      {renderSeatModal()}
      {renderAlertModal()}

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
            source={{ uri: selectedImage ?? DEFAULT_CAR_IMAGE }}
            style={{ width: '90%', height: 200, resizeMode: 'contain', borderRadius: 10 }}
          />
          <Text className="text-white mt-4 font-CairoBold">اضغط في أي مكان للإغلاق</Text>
        </Pressable>
    </Modal>
    </RideLayout>
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

export default RideDetails;