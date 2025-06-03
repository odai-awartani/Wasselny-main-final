import React, { useRef, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLanguage } from '@/context/LanguageContext';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useUser } from '@clerk/clerk-expo';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.90;

type RouteType = '/(root)/track' | '/(root)/(tabs)/barriers';

type RootStackParamList = {
  tabs: { screen: string };
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const FeatureCards = () => {
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  const scrollViewRef = useRef<ScrollView>(null);
  const navigation = useNavigation<NavigationProp>();
  const { user } = useUser();
  const [isDriver, setIsDriver] = useState<boolean | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const totalCards = isDriver === false ? 3 : 2;

  const SkeletonCard = () => (
    <View className={`${isArabic ? 'ml-4' : 'mr-4'} bg-gray-200 rounded-2xl p-6 h-[205px]`} style={{ width: CARD_WIDTH }}>
      <View className={`flex-row items-center justify-between ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
        <View className="flex-1">
          <View className="flex-row items-center justify-between mb-4">
            {isArabic ? (
              <>
                <View className={`flex-row items-center ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
                  <View className="w-24 h-6 bg-gray-300 rounded-full" />
                  <View className="w-6 h-6 bg-gray-300 rounded-full ml-2" />
                </View>
                <View className="w-12 h-12 bg-gray-300 rounded-full" />
              </>
            ) : (
              <>
                <View className="w-12 h-12 bg-gray-300 rounded-full" />
                <View className={`flex-row items-center ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
                  <View className="w-24 h-6 bg-gray-300 rounded-full" />
                  <View className="w-6 h-6 bg-gray-300 rounded-full mr-2" />
                </View>
              </>
            )}
          </View>
          <View className="w-48 h-8 bg-gray-300 rounded-full mb-2" />
          <View className="w-full h-16 bg-gray-300 rounded-lg mb-4" />
        </View>
        <View className={`absolute ${isArabic ? '-left-4' : '-right-4'} -top-4 w-32 h-32 bg-gray-300 rounded-full opacity-50`} />
        <View className={`absolute ${isArabic ? '-left-8' : '-right-8'} -bottom-8 w-24 h-24 bg-gray-300 rounded-full opacity-50`} />
      </View>
    </View>
  );

  useEffect(() => {
    const checkIfUserIsDriver = async () => {
      if (!user?.id) {
        setIsDriver(false);
        return;
      }
      
      try {
        const userRef = doc(db, 'users', user.id);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setIsDriver(userData.driver && userData.driver.is_active === true);
        } else {
          setIsDriver(false);
        }
      } catch (error) {
        console.error('Error checking driver status:', error);
        setIsDriver(false);
      }
    };

    checkIfUserIsDriver();
  }, [user?.id]);

  useEffect(() => {
    if (isArabic && scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: false });
    }

    const interval = setInterval(() => {
      let nextIndex;
      if (isArabic) {
        nextIndex = currentIndex === 0 ? totalCards - 1 : currentIndex - 1;
      } else {
        nextIndex = currentIndex === totalCards - 1 ? 0 : currentIndex + 1;
      }

      setCurrentIndex(nextIndex);
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({
          x: nextIndex * (CARD_WIDTH + 16),
          animated: true
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isArabic, currentIndex, totalCards]);

  const handleCardPress = (route: RouteType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (route === '/(root)/(tabs)/barriers') {
      navigation.navigate('tabs', { screen: 'barriers' });
    } else {
      router.push(route);
    }
  };

  // Show skeleton loading while checking driver status
  if (isDriver === null) {
    return (
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        decelerationRate={0.9}
        snapToInterval={CARD_WIDTH + 16}
        snapToAlignment="center"
        contentContainerStyle={{
          flexDirection: isArabic ? 'row-reverse' : 'row',
          paddingHorizontal: 16
        }}
      >
        <SkeletonCard />
        <SkeletonCard />
      </ScrollView>
    );
  }

  return (
    <ScrollView 
      ref={scrollViewRef}
      horizontal 
      showsHorizontalScrollIndicator={false}
      decelerationRate={0.9}
      snapToInterval={CARD_WIDTH + 16}
      snapToAlignment="center"
      contentContainerStyle={{
        flexDirection: isArabic ? 'row-reverse' : 'row',
        paddingHorizontal: 16
      }}
    >
      {/* Become a Driver Card - Only shown to non-drivers */}
      {!isDriver && (
        <TouchableOpacity
          onPress={() => router.push('/(root)/driverInfo')}
          className={isArabic ? 'ml-4' : 'mr-4'}
          activeOpacity={0.9}
          style={{ width: CARD_WIDTH }}
        >
          <LinearGradient
            colors={['#7C3AED', '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            className="rounded-2xl p-6 h-[205px]"
          >
            <View className={`flex-row items-center justify-between ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
              <View className="flex-1">
                <View className="flex-row items-center justify-between mb-4">
                  {isArabic ? (
                    <>
                      <View className={`flex-row items-center ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
                        <Text className={`text-white font-CairoBold ${isArabic ? 'ml-2' : 'mr-2'}`}>
                          {isArabic ? 'استكشف المزيد' : 'Learn More'}
                        </Text>
                        <MaterialCommunityIcons 
                          name={isArabic ? 'arrow-left' : 'arrow-right'} 
                          size={20} 
                          color="#fff" 
                        />
                      </View>
                      <View className="bg-white/20 w-12 h-12 rounded-full items-center justify-center">
                        <MaterialCommunityIcons name="car" size={24} color="#fff" />
                      </View>
                    </>
                  ) : (
                    <>
                      <View className="bg-white/20 w-12 h-12 rounded-full items-center justify-center">
                        <MaterialCommunityIcons name="car" size={24} color="#fff" />
                      </View>
                      <View className={`flex-row items-center ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
                        <Text className={`text-white font-CairoBold ${isArabic ? 'ml-2' : 'mr-2'}`}>
                          {isArabic ? 'استكشف المزيد' : 'Learn More'}
                        </Text>
                        <MaterialCommunityIcons 
                          name={isArabic ? 'arrow-left' : 'arrow-right'} 
                          size={20} 
                          color="#fff" 
                        />
                      </View>
                    </>
                  )}
                </View>
                <Text className={`text-white text-2xl font-CairoBold mb-2 ${isArabic ? 'text-right' : 'text-left'}`}>
                  {isArabic ? 'كن سائقاً' : 'Become a Driver'}
                </Text>
                <Text className={`text-white/80  font-CairoRegular mb-4 ${isArabic ? 'text-right' : 'text-left'}`} numberOfLines={3}>
                  {isArabic
                    ? "انضم إلى مجتمع السائقين وابدأ في كسب المال من خلال مشاركة رحلاتك مع الآخرين."
                    : "Join our driver community and start earning by sharing your rides with others."}
                </Text>
              </View>
              <View className={`absolute ${isArabic ? '-left-4' : '-right-4'} -top-4 w-32 h-32 bg-white/10 rounded-full`} />
              <View className={`absolute ${isArabic ? '-left-8' : '-right-8'} -bottom-8 w-24 h-24 bg-white/10 rounded-full`} />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Tracking Feature Card */}
      <TouchableOpacity
        onPress={() => handleCardPress('/(root)/track')}
        className={isArabic ? 'ml-4' : 'mr-4'}
        activeOpacity={0.9}
        style={{ width: CARD_WIDTH }}
      >
        <LinearGradient
          colors={['#F97316', '#FB923C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="rounded-2xl p-6 h-[205]"
        >
          <View className={`flex-row items-center justify-between ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
            <View className="flex-1">
              <View className="flex-row items-center justify-between mb-4">
                {isArabic ? (
                  <>
                    <View className={`flex-row items-center ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
                      <Text className={`text-white font-CairoBold ${isArabic ? 'ml-2' : 'mr-2'}`}>
                        {isArabic ? 'استكشف المزيد' : 'Explore'}
                      </Text>
                      <MaterialCommunityIcons 
                        name={isArabic ? 'arrow-left' : 'arrow-right'} 
                        size={20} 
                        color="#fff" 
                      />
                    </View>
                    <View className="bg-white/20 w-12 h-12 rounded-full items-center justify-center">
                      <MaterialCommunityIcons name="map-marker-path" size={24} color="#fff" />
                    </View>
                  </>
                ) : (
                  <>
                    <View className="bg-white/20 w-12 h-12 rounded-full items-center justify-center">
                      <MaterialCommunityIcons name="map-marker-path" size={24} color="#fff" />
                    </View>
                    <View className={`flex-row items-center ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
                      <Text className={`text-white font-CairoBold ${isArabic ? 'ml-2' : 'mr-2'}`}>
                        {isArabic ? 'استكشف المزيد' : 'Explore'}
                      </Text>
                      <MaterialCommunityIcons 
                        name={isArabic ? 'arrow-left' : 'arrow-right'} 
                        size={20} 
                        color="#fff" 
                      />
                    </View>
                  </>
                )}
              </View>
              <Text className={`text-white text-2xl font-CairoBold mb-2 ${isArabic ? 'text-right' : 'text-left'}`}>
                {isArabic ? 'تتبع الرحلات' : 'Track Rides'}
              </Text>
              <Text className={`text-white/80 font-CairoRegular mb-4 ${isArabic ? 'text-right' : 'text-left'}`} numberOfLines={3}>
                {isArabic 
                  ? "تتبع رحلات أصدقائك وعائلتك في الوقت الفعلي، وابقَ على اطلاع دائم بموقعهم لحظة بلحظة."
                  : "Track your friends' and family's trips in real time and stay instantly updated on their location."}
              </Text>
            </View>
            <View className={`absolute ${isArabic ? '-left-4' : '-right-4'} -top-4 w-32 h-32 bg-white/10 rounded-full`} />
            <View className={`absolute ${isArabic ? '-left-8' : '-right-8'} -bottom-8 w-24 h-24 bg-white/10 rounded-full`} />
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* Barriers Feature Card */}
      <TouchableOpacity
        onPress={() => handleCardPress('/(root)/(tabs)/barriers')}
        className={isArabic ? 'ml-4' : 'mr-4'}
        activeOpacity={0.9}
        style={{ width: CARD_WIDTH }}
      >
        <LinearGradient
          colors={['#059669', '#10B981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="rounded-2xl p-6 h-[205px]"
        >
          <View className={`flex-row items-center justify-between ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
            <View className="flex-1">
              <View className="flex-row items-center justify-between mb-4">
                {isArabic ? (
                  <>
                    <View className={`flex-row items-center ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
                      <Text className={`text-white font-CairoBold ${isArabic ? 'ml-2' : 'mr-2'}`}>
                        {isArabic ? 'استكشف المزيد' : 'Learn More'}
                      </Text>
                      <MaterialCommunityIcons 
                        name={isArabic ? 'arrow-left' : 'arrow-right'} 
                        size={20} 
                        color="#fff" 
                      />
                    </View>
                    <View className="bg-white/20 w-12 h-12 rounded-full items-center justify-center">
                      <MaterialCommunityIcons name="shield-check" size={24} color="#fff" />
                    </View>
                  </>
                ) : (
                  <>
                    <View className="bg-white/20 w-12 h-12 rounded-full items-center justify-center">
                      <MaterialCommunityIcons name="shield-check" size={24} color="#fff" />
                    </View>
                    <View className={`flex-row items-center ${isArabic ? 'flex-row-reverse' : 'flex-row'}`}>
                      <Text className={`text-white font-CairoBold ${isArabic ? 'ml-2' : 'mr-2'}`}>
                        {isArabic ? 'استكشف المزيد' : 'Learn More'}
                      </Text>
                      <MaterialCommunityIcons 
                        name={isArabic ? 'arrow-left' : 'arrow-right'} 
                        size={20} 
                        color="#fff" 
                      />
                    </View>
                  </>
                )}
              </View>
              <Text className={`text-white text-2xl font-CairoBold mb-2 ${isArabic ? 'text-right' : 'text-left'}`}>
                {isArabic ? 'الحواجز' : 'Barriers'}
              </Text>
              <Text className={`text-white/80 font-CairoRegular mb-4 ${isArabic ? 'text-right' : 'text-left'}`} numberOfLines={2}>
                {isArabic
                  ? "تعرّف على حالة الحواجز في فلسطين لحظة بلحظة وابقَ على اطلاع دائم بآخر التحديثات."
                  : "Get real-time updates on checkpoint conditions in Palestine and stay informed at every moment."}
              </Text>
            </View>
            <View className={`absolute ${isArabic ? '-left-4' : '-right-4'} -top-4 w-32 h-32 bg-white/10 rounded-full`} />
            <View className={`absolute ${isArabic ? '-left-8' : '-right-8'} -bottom-8 w-24 h-24 bg-white/10 rounded-full`} />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
};

export default FeatureCards;