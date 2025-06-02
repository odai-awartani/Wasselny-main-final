import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, Animated, Dimensions, Linking, Modal, I18nManager } from 'react-native';
import { MaterialCommunityIcons, FontAwesome5, Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { icons } from '@/constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUser } from '@clerk/clerk-expo';
import { findOrCreateChat } from '@/lib/chat';
import { useLanguage } from '@/context/LanguageContext';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDistanceToNow } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';

interface UserProfile {
  name: string;
  profile_image_url: string;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  industry?: string | null;
  driver?: {
    car_type?: string;
    car_seats?: number;
    car_image_url?: string;
    rating?: number;
    total_rides?: number;
  };
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

interface Ride {
  id: string;
  origin_address: string;
  destination_address: string;
  ride_datetime: string;
  status: string;
  available_seats: number;
}

interface ChatUser {
  id: string;
  fullName: string;
  imageUrl: string;
}

const DEFAULT_PROFILE_IMAGE = 'https://www.pngitem.com/pimgs/m/146-1468479_my-profile-icon-blank-profile-picture-circle-hd.png';
const DEFAULT_CAR_IMAGE = 'https://via.placeholder.com/200x150';

const { width } = Dimensions.get('window');

const SkeletonLoading = () => {
  const { language } = useLanguage();
  const shimmerValue = new Animated.Value(0);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerValue, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const opacity = shimmerValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  return (
    <View className="flex-1 bg-white">
      <Animated.View style={{ opacity }} className="h-64 bg-gray-200" />
      <View className={`px-4 -mt-16 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
        <Animated.View 
          style={{ opacity }} 
          className={`h-32 w-32 rounded-full bg-gray-200 border-4 border-white ${language === 'ar' ? 'ml-auto' : 'mr-auto'}`} 
        />
        <View className={`mt-4 space-y-4 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
          <Animated.View 
            style={{ opacity }} 
            className={`h-8 bg-gray-200 rounded-lg ${language === 'ar' ? 'w-3/4 ml-auto' : 'w-3/4 mr-auto'}`} 
          />
          <Animated.View 
            style={{ opacity }} 
            className={`h-6 bg-gray-200 rounded-lg ${language === 'ar' ? 'w-1/2 ml-auto' : 'w-1/2 mr-auto'}`} 
          />
          <Animated.View 
            style={{ opacity }} 
            className={`h-6 bg-gray-200 rounded-lg ${language === 'ar' ? 'w-2/3 ml-auto' : 'w-2/3 mr-auto'}`} 
          />
        </View>
      </View>
    </View>
  );
};

export default function Profile() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { t, language, isRTL } = useLanguage();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const { user: currentUser } = useUser();
  const [ratings, setRatings] = useState<DetailedRating[]>([]);
  const [showRatings, setShowRatings] = useState(false);
  const insets = useSafeAreaInsets();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const textAlign = language === 'ar' ? 'right' : 'left';
  const flexDirection = language === 'ar' ? 'flex-row-reverse' : 'flex-row';
  const marginDirection = language === 'ar' ? 'mr' : 'ml';
  const paddingDirection = language === 'ar' ? 'pr' : 'pl';

  const pastelColors = [
    '#FFD6E0', '#D6EFFF', '#FFF5D6', '#D6FFD6', '#F0D6FF', '#FFE6D6', '#D6FFF6', '#F9FFD6'
  ];
  function getPastelColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return pastelColors[Math.abs(hash) % pastelColors.length];
  }

  // Animated expand/collapse
  const animatedHeight = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(animatedHeight, {
      toValue: showRatings ? 1 : 0,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [showRatings]);

  const renderStars = (value: number, size = 16) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <MaterialIcons
          key={i}
          name={i <= Math.round(value) ? 'star' : 'star-border'}
          size={size}
          color={i <= Math.round(value) ? '#F59E42' : '#E5E7EB'}
        />
      );
    }
    return <View className="flex-row items-center">{stars}</View>;
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        const userDoc = await getDoc(doc(db, 'users', id as string));
        
        if (!userDoc.exists()) {
          setError('لم يتم العثور على الملف الشخصي');
          return;
        }

        const userData = userDoc.data();
        console.log('Fetched user data:', userData);
        
        setUser({
          name: userData.name || 'مستخدم',
          profile_image_url: userData.profile_image_url || DEFAULT_PROFILE_IMAGE,
          gender: userData.gender,
          phone: userData.phone,
          email: userData.email,
          driver: userData.driver ? {
            car_type: userData.driver.car_type || 'غير محدد',
            car_seats: userData.driver.car_seats || 4,
            car_image_url: userData.driver.car_image_url || DEFAULT_CAR_IMAGE,
            rating: userData.driver.rating || 0,
            total_rides: userData.driver.total_rides || 0,
          } : undefined
        });

        // Fetch detailed ratings if user is a driver
        if (userData.driver) {
          console.log('Fetching ratings for driver:', id);
          try {
          const ratingsQuery = query(
            collection(db, 'ratings'),
              where('driver_id', '==', id),
              orderBy('created_at', 'desc')
          );
          
          const ratingsSnapshot = await getDocs(ratingsQuery);
            console.log('Ratings query snapshot:', ratingsSnapshot.empty ? 'No ratings found' : 'Ratings found');
            
            const ratingsData = ratingsSnapshot.docs.map(doc => {
              const data = doc.data();
              console.log('Rating document data:', data);
              return {
                id: doc.id,
                overall: data.overall || 0,
                driving: data.driving || 0,
                behavior: data.behavior || 0,
                punctuality: data.punctuality || 0,
                cleanliness: data.cleanliness || 0,
                comment: data.comment || '',
                passenger_name: data.passenger_name || 'Anonymous',
                created_at: data.created_at || new Date(),
                ride_details: {
                  origin_address: data.ride_details?.origin_address || '',
                  destination_address: data.ride_details?.destination_address || '',
                  ride_datetime: data.ride_details?.ride_datetime || ''
                }
              } as DetailedRating;
            });
            
            console.log('Processed ratings data:', ratingsData);
          setRatings(ratingsData);

          // Calculate average rating
          if (ratingsData.length > 0) {
            const avgRating = ratingsData.reduce((acc, curr) => acc + curr.overall, 0) / ratingsData.length;
              console.log('Calculated average rating:', avgRating);
              setUser(prev => ({
                ...prev!,
              driver: {
                  ...prev!.driver!,
                rating: avgRating,
                total_rides: ratingsData.length
              }
            }));
            }
          } catch (error) {
            console.error('Error fetching ratings:', error);
          }
        }

        // Fetch user's rides if they are a driver
        if (userData.driver) {
          console.log('Fetching rides for driver:', id);
          try {
          const ridesQuery = query(
            collection(db, 'rides'),
            where('driver_id', '==', id),
              where('status', 'in', ['available', 'completed', 'active', 'full', 'in-progress'])
          );
          
          const ridesSnapshot = await getDocs(ridesQuery);
            console.log('Rides query snapshot:', ridesSnapshot.empty ? 'No rides found' : 'Rides found');
            
            const ridesData = ridesSnapshot.docs.map(doc => {
              const data = doc.data();
              console.log('Ride document data:', data);
              return {
            id: doc.id,
                ...data
              } as Ride;
            });
          
            console.log('Processed rides data:', ridesData);
          setRides(ridesData);
          } catch (error) {
            console.error('Error fetching rides:', error);
          }
        }

      } catch (err) {
        console.error('Error fetching profile:', err);
        setError('حدث خطأ في تحميل الملف الشخصي');
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchUserData();
    }
  }, [id]);

  if (loading) {
    return <SkeletonLoading />;
  }

  if (error || !user) {
    return (
      <View className="flex-1 justify-center items-center bg-gray-100">
        <Text className="text-red-500 mb-4">{error || 'حدث خطأ غير متوقع'}</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-blue-500">العودة</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderDetailedRatings = () => {
    if (!user.driver || ratings.length === 0) return null;

    return (
      <View className="bg-white py-2 px-1 rounded-2xl shadow-md mb-6">
        <TouchableOpacity 
          onPress={() => setShowRatings(!showRatings)}
          className={`${flexDirection} justify-between items-center mb-2 bg-orange-50 p-4 rounded-xl`}
          activeOpacity={0.8}
        >
          <View className={`${flexDirection} items-center`}>
            <View>
              <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-gray-900`}>
                {language === 'ar' ? 'التقييمات' : 'Ratings'}
              </Text>
              <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-500`}>
                {language === 'ar' ? 'انقر لعرض التقييمات' : 'Tap to view ratings'}
              </Text>
            </View>
          </View>
          <View className="bg-white px-4 py-2 items-center justify-center rounded-full shadow-sm">
            <Text className={`text-base ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-orange-500`}>
              {ratings.length}
          </Text>
          </View>
        </TouchableOpacity>

        <Animated.View style={{ height: animatedHeight.interpolate({ inputRange: [0, 1], outputRange: [0, ratings.length * 220] }), overflow: 'hidden' }}>
        {showRatings && (
          <View className="space-y-4">
            {ratings.map((rating, index) => (
              <View key={index} className="bg-gray-50 rounded-xl overflow-hidden">
                {/* Orange Gradient Line */}
                <LinearGradient
                  colors={["#F59E42", "#FFD6E0"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ height: 4, width: '100%' }}
                />
                <View className="p-2">
                  {/* Passenger Info and Overall Rating */}
                  <View className={`${flexDirection} justify-between items-center mb-3`}>
                    <Text className={`text-base ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-gray-800`}>
                      {rating.passenger_name || 'Anonymous'}
                    </Text>
                    <View className={`${flexDirection} items-center`}>
                      <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-gray-900 mr-1 ml-1`}>
                        {rating.overall?.toFixed(1) || '0.0'}
                      </Text>
                      {renderStars(rating.overall, 16)}
                  </View>
                </View>

                  {/* Category Ratings */}
                <View className="space-y-2">
                    {[
                      { label: language === 'ar' ? 'قيادة السيارة' : 'Driving', value: rating.driving },
                      { label: language === 'ar' ? 'الأخلاق والسلوك' : 'Behavior', value: rating.behavior },
                      { label: language === 'ar' ? 'الالتزام بالمواعيد' : 'Punctuality', value: rating.punctuality },
                      { label: language === 'ar' ? 'نظافة السيارة' : 'Cleanliness', value: rating.cleanliness }
                    ].map((cat, i) => (
                      <View key={i} className={`${flexDirection} justify-between items-center`}>
                        <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600`}>
                          {cat.label}
                        </Text>
                        <View className={`${flexDirection} items-center`}>
                          <Text className={`text-sm ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-gray-900 mr-1 ml-1`}>
                            {cat.value?.toFixed(1) || '0.0'}
                          </Text>
                          {renderStars(cat.value, 12)}
                  </View>
                  </View>
                    ))}
                </View>

                  {/* Comment */}
                {rating.comment && (
                    <View className="mt-3 bg-white p-3 rounded-lg">
                      <Text className={`text-sm text-gray-700 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                      {rating.comment}
                    </Text>
                  </View>
                )}

                  {/* Date */}
                  <Text className={`text-xs text-gray-400 mt-2 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {formatDistanceToNow(new Date(rating.created_at?.toDate?.() || rating.created_at), { addSuffix: true, locale: language === 'ar' ? ar : enUS })}
                </Text>
                </View>
              </View>
            ))}
          </View>
        )}
        </Animated.View>
      </View>
    );
  };

  const handlePhoneCall = () => {
    if (user?.phone) {
      Linking.openURL(`tel:${user.phone}`);
    }
  };

  const handleEmailPress = () => {
    if (user?.email) {
      Linking.openURL(`mailto:${user.email}`);
    }
  };

  const handleCreateChat = async () => {
                if (!currentUser) return;
                setMessageLoading(true);
                try {
      const currentUserData = {
        id: currentUser.id,
        fullName: currentUser.fullName || 'User',
        firstName: currentUser.firstName || 'User',
        lastName: currentUser.lastName || '',
        emailAddresses: currentUser.emailAddresses?.map(email => email.emailAddress) || [],
        imageUrl: currentUser.imageUrl || '',
        unsafeMetadata: currentUser.unsafeMetadata || {},
        createdAt: currentUser.createdAt?.toISOString() || new Date().toISOString(),
        updatedAt: currentUser.updatedAt?.toISOString() || new Date().toISOString()
      };

      const targetUserData = {
        id: id as string,
        fullName: user.name,
        firstName: user.name.split(' ')[0] || '',
        lastName: user.name.split(' ')[1] || '',
        emailAddresses: [user.email || ''],
        imageUrl: user.profile_image_url,
        unsafeMetadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const chatId = await findOrCreateChat(currentUserData, targetUserData);
                  if (chatId) {
                    router.push({
                      pathname: '/(root)/chat/[id]',
          params: { id: chatId, name: user.name, avatar: user.profile_image_url }
                    });
                  }
                } catch (err) {
                  console.error('Error creating chat:', err);
                } finally {
                  setMessageLoading(false);
                }
  };

  const ImagePreviewModal = () => (
    <Modal
      visible={!!selectedImage}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setSelectedImage(null)}
    >
      <TouchableOpacity 
        className="flex-1 bg-black/90 justify-center items-center"
        activeOpacity={1}
        onPress={() => setSelectedImage(null)}
      >
        <Image
          source={{ uri: selectedImage || '' }}
          className="w-full h-96"
          resizeMode="contain"
        />
      </TouchableOpacity>
    </Modal>
  );

  const getGenderText = (gender: string | null | undefined) => {
    if (!gender) return '';
    if (language === 'ar') {
      return gender === 'Male' ? 'ذكر' : 'أنثى';
    }
    return gender;
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Header Section - Only show if user is a driver */}
      {user.driver && (
        <View className="h-56 bg-gray-200 relative">
          {/* Back Button */}
          <TouchableOpacity 
            onPress={() => router.back()}
            className={`absolute top-12 left-4 z-10 bg-white/80 p-2 rounded-full`}
            style={{
              shadowColor: "#000",
              shadowOffset: {
                width: 0,
                height: 2,
              },
              shadowOpacity: 0.25,
              shadowRadius: 3.84,
              elevation: 5,
            }}
          >
            <MaterialIcons 
              name="arrow-back" 
              size={20} 
              color="#374151" 
            />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={() => setSelectedImage(user.driver?.car_image_url || null)}
            activeOpacity={0.9}
          >
            <Image
              source={{ uri: user.driver.car_image_url }}
              className="w-full h-full"
              resizeMode="cover"
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Back Button for non-drivers */}
      {!user.driver && (
        <TouchableOpacity 
          onPress={() => router.back()}
          className={`absolute top-12 left-4 z-10 bg-white/80 p-2 rounded-full`}
          style={{
            shadowColor: "#000",
            shadowOffset: {
              width: 0,
              height: 2,
            },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
          }}
        >
          <MaterialIcons 
            name="arrow-back" 
            size={20} 
            color="#374151" 
          />
        </TouchableOpacity>
      )}

      {/* Profile Content */}
      <View className={`px-4 ${user.driver ? '-mt-16' : 'mt-4'}`}>
        {/* Profile Image */}
        <View className={`${language === 'ar' ? 'items-end' : 'items-start'}`}>
          <TouchableOpacity 
            onPress={() => setSelectedImage(user.profile_image_url || DEFAULT_PROFILE_IMAGE)}
            activeOpacity={0.9}
          >
            <Image
              source={{ uri: user.profile_image_url || DEFAULT_PROFILE_IMAGE }}
              className="h-28 w-28 rounded-full bg-gray-200 border-4 border-white"
            />
          </TouchableOpacity>
        </View>

        {/* User Info */}
        <View className={`mt-3 space-y-2 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
          <Text className={`text-xl ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-gray-900`}>
            {user.name}
          </Text>
          {user.gender && (
            <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600`}>
              {getGenderText(user.gender)}
            </Text>
          )}
          {user.industry && (
            <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600`}>
              {user.industry}
            </Text>
          )}
        </View>

        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 200 }}
        >
          {/* Contact Info */}
          <View className="mt-4 space-y-3">
            {user.phone && (
              <TouchableOpacity 
                onPress={handlePhoneCall}
                className={`${flexDirection} items-center bg-gray-50 p-3 rounded-lg`}
              >
                <View className="w-8 h-8 bg-blue-100 rounded-full items-center justify-center">
                  <MaterialIcons name="phone" size={16} color="#4f46e5" />
                </View>
                <View className={`flex-1 ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
                  <Text className={`text-xs ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-500`}>
                    {t.PhoneNumber}
                  </Text>
                  <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-900`}>
                    {user.phone}
                  </Text>
                </View>
                <MaterialIcons 
                  name={language === 'ar' ? "chevron-left" : "chevron-right"} 
                  size={20} 
                  color="#9CA3AF" 
                />
              </TouchableOpacity>
            )}

            {user.email && (
              <TouchableOpacity 
                onPress={handleEmailPress}
                className={`${flexDirection} items-center bg-gray-50 p-3 rounded-lg`}
              >
                <View className="w-8 h-8 bg-purple-100 rounded-full items-center justify-center">
                  <MaterialIcons name="email" size={16} color="#A855F7" />
          </View>
                <View className={`flex-1 ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
                  <Text className={`text-xs ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-500`}>
                    {t.email}
              </Text>
                  <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-900`}>
                    {user.email}
              </Text>
            </View>
                <MaterialIcons 
                  name={language === 'ar' ? "chevron-left" : "chevron-right"} 
                  size={20} 
                  color="#9CA3AF" 
                />
              </TouchableOpacity>
            )}

            {/* Chat Button */}
            <TouchableOpacity 
              onPress={handleCreateChat}
              className={`${flexDirection} items-center bg-gray-50 p-3 rounded-lg`}
            >
              <View className="w-8 h-8 bg-purple-100 rounded-full items-center justify-center">
                <MaterialIcons name="chat" size={16} color="#A855F7" />
              </View>
              <View className={`flex-1 ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
                <Text className={`text-xs ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-500`}>
                  {language === 'ar' ? 'الدردشة' : 'Chat'}
                </Text>
                <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-900`}>
                  {language === 'ar' ? 'ابدأ محادثة' : 'Start a conversation'}
                </Text>
              </View>
              <MaterialIcons 
                name={language === 'ar' ? "chevron-left" : "chevron-right"} 
                size={20} 
                color="#9CA3AF" 
              />
            </TouchableOpacity>
          </View>

          
          {/* Car Details */}
          {user.driver && (
            <View className="mt-4 bg-white rounded-lg p-3 shadow-sm">
              <Text className={`text-base ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-gray-900 mb-2`}>
                {t.carInformation}
              </Text>
              <View className="space-y-2">
                <View className={`${flexDirection} justify-between items-center`}>
                  <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-900`}>
                    {user.driver.car_type}
                  </Text>
                  <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600`}>
                    {t.CarType}
                  </Text>
                </View>
                <View className={`${flexDirection} justify-between items-center`}>
                  <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-900`}>
                    {user.driver.car_seats}
                  </Text>
                  <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600`}>
                    {t.NumberOfSeats}
                  </Text>
                </View>
            </View>
          </View>
        )}

          {/* Driver Stats */}
          {user.driver && (
            <View className={`mt-4 ${flexDirection} justify-between`}>
              <View className="items-center bg-gray-100 rounded-lg p-3 flex-1 mx-1 shadow-sm">
                <Text className="text-xl font-CairoBold text-gray-900">
                  {user.driver.total_rides || 0}
                </Text>
                <Text className={`text-xs ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-500`}>
                  {t.TotalRides}
                </Text>
              </View>
              <View className="items-center bg-gray-100  rounded-lg p-3 flex-1 mx-1 shadow-sm">
                <View className={`${flexDirection} items-center`}>
                  <Text className={`text-xl font-CairoBold text-gray-900 ${language === 'ar' ? 'ml-1' : 'mr-1'}`}>
                    {user.driver.rating?.toFixed(1) || '0.0'}
                </Text>
                  <Image source={icons.star} style={{ width: 16, height: 16 }} />
                </View>
                <Text className={`text-xs ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-500`}>
                  {t.Rating}
                </Text>
            </View>
          </View>
        )}


          {/* Ratings */}
          {renderDetailedRatings()}

          {/* Active Rides */}
          {user.driver && rides.length > 0 && (
            <View className="mt-4 bg-white rounded-lg p-4 shadow-sm mb-4">
              <View className={`${flexDirection} justify-between items-center mb-4`}>
                <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-gray-900`}>
                  {t.Rides}
                </Text>
                <View className="bg-blue-50 px-3 py-1 rounded-full">
                  <Text className={`text-sm ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-blue-500`}>
                    {rides.length}
            </Text>
                </View>
              </View>
              <View className="space-y-3">
              {rides.map((ride) => (
                <TouchableOpacity
                  key={ride.id}
                  onPress={() => router.push(`/ride-details/${ride.id}`)}
                  className="bg-gray-50 p-4 rounded-xl"
                >
                    {/* Status and Seats */}
                    <View className={`${flexDirection} justify-between items-center mb-3`}>
                      <View className={`${flexDirection} items-center bg-white px-3 py-1 rounded-full`}>
                        <Text className={`text-xs ${language === 'ar' ? 'font-CairoBold text-right mr-1' : 'font-JakartaBold text-left ml-1'} ${
                          ride.status === 'available' ? 'text-green-500' :
                          ride.status === 'completed' ? 'text-blue-500' :
                          ride.status === 'in-progress' ? 'text-orange-500' :
                          ride.status === 'full' ? 'text-red-500' :
                          'text-gray-500'
                        }`}>
                          {ride.status === 'available' ? (language === 'ar' ? 'متاح' : 'Available') :
                           ride.status === 'completed' ? (language === 'ar' ? 'مكتمل' : 'Completed') :
                           ride.status === 'in-progress' ? (language === 'ar' ? 'قيد التنفيذ' : 'In Progress') :
                           ride.status === 'full' ? (language === 'ar' ? 'ممتلئ' : 'Full') :
                           ride.status}
                    </Text>
                      </View>
                      <View className={`${flexDirection} items-center bg-white px-3 py-1 rounded-full`}>
                        <Text className={`text-sm font-CairoBold mt-1.5 text-gray-900 ${language === 'ar' ? 'ml-1' : 'mr-1'}`}>
                        {ride.available_seats}
                      </Text>
                        <Text className={`text-xs ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-500`}>
                          {t.availableSeats}
                        </Text>
                      </View>
                    </View>

                    {/* Date and Time */}
                    <View className={`${flexDirection} items-center mb-3`}>
                      <MaterialIcons 
                        name="event" 
                        size={16} 
                        color="#6B7280" 
                        style={{ marginRight: language === 'ar' ? 0 : 8, marginLeft: language === 'ar' ? 8 : 0 }}
                      />
                      <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600`}>
                        {ride.ride_datetime}
                      </Text>
                    </View>

                    {/* Route Details */}
                    <View className="space-y-2 bg-white p-3 rounded-lg">
                      <View className={`${flexDirection} items-center`}>
                        <Image source={icons.pin} className='w-4 h-4' resizeMode='contain' tintColor={
                        "green"} style={{ marginRight: language === 'ar' ? 0 : 8, marginLeft: language === 'ar' ? 8 : 0 }} />
                        <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600 flex-1`}>
                          {ride.origin_address}
                        </Text>
                      </View>
                      <View className={`${flexDirection} items-center`}>
                        <Image source={icons.pin} className='w-4 h-4' resizeMode='contain' tintColor={
                        "red"} style={{ marginRight: language === 'ar' ? 0 : 8, marginLeft: language === 'ar' ? 8 : 0 }} />
                        <Text className={`text-sm ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'} text-gray-600 flex-1`}>
                        {ride.destination_address}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
      </View>

      {/* Image Preview Modal */}
      <ImagePreviewModal />
    </SafeAreaView>
  );
}