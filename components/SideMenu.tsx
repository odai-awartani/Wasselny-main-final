import React, { useState, useEffect } from 'react';
import { View, Text, Switch, TouchableOpacity, Share, Platform, Linking, Image } from 'react-native';
import { ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '@/context/LanguageContext';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useLocationStore } from '@/store';
import { DrawerContentScrollView, DrawerContentComponentProps } from '@react-navigation/drawer';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useProfile } from '@/context/ProfileContext';
import { icons } from '@/constants';

export default function SideMenu(props: DrawerContentComponentProps) {
  const { language, setLanguage, t } = useLanguage();
  const { userAddress } = useLocationStore();
  const { signOut } = useAuth();
  const { user } = useUser();
  const isRTL = language === 'ar';
  const { profileImageUrl, refreshProfileImage } = useProfile();
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [savedLocations, setSavedLocations] = useState<Array<{id: string, name: string, isDefault: boolean}>>([]);
  const [isDriver, setIsDriver] = useState(false);

  useEffect(() => {
    const fetchSavedLocations = async () => {
      if (!user?.id) return;
      
      try {
        // Set up real-time listener for saved locations
        const locationsRef = collection(db, 'user_locations');
        const q = query(locationsRef, where('userId', '==', user.id));
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const locations = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Array<{id: string, name: string, isDefault: boolean}>;
        
        setSavedLocations(locations);
        });

        return () => unsubscribe();
      } catch (error) {
        console.error('Error fetching saved locations:', error);
      }
    };

    fetchSavedLocations();
  }, [user?.id]);

  // Add real-time listener for current location
  useEffect(() => {
    if (!user?.id) return;

    const userRef = doc(db, 'users', user.id);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        // Update profile image if changed
        const imageUrl = userData.profile_image_url || userData.driver?.profile_image_url || null;
        if (imageUrl !== profileImageUrl) {
          refreshProfileImage();
        }
        
        // Update current location if changed
        const currentLocation = userData.current_location || null;
        if (currentLocation && currentLocation !== userAddress) {
          // Update the location store
          useLocationStore.setState({ userAddress: currentLocation });
        }
      }
    });

    return () => unsubscribe();
  }, [user?.id, profileImageUrl, userAddress]);

  // Add driver status check
  useEffect(() => {
    const checkDriverStatus = async () => {
      if (!user?.id) return;

      const userRef = doc(db, 'users', user.id);
      const unsubscribe = onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
          const userData = doc.data();
          setIsDriver(userData.driver?.is_active || false);
        }
      });

      return () => unsubscribe();
    };

    checkDriverStatus();
  }, [user?.id]);

  const toggleLocation = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!locationEnabled) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationEnabled(status === 'granted');
    } else {
      setLocationEnabled(false);
    }
  };
  const handleSignOut = () => {
    signOut();
    router.replace("/(auth)/sign-in");
  };

  const toggleLanguage = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLanguage(language === 'ar' ? 'en' : 'ar');
    props.navigation.closeDrawer();
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: t.shareAppMessage,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleRate = () => {
    const storeUrl = Platform.select({
      ios: 'https://apps.apple.com/app/idYOUR_APP_ID',
      android: 'market://details?id=YOUR_APP_ID',
    });
    if (storeUrl) {
      Linking.openURL(storeUrl);
    }
  };

  return (
    <View className="flex-1 mt-10 bg-white">
      {/* Profile Section */}
      <View className="bg-white">
        <View className="mt-2 mb-6 items-center w-full">
          <TouchableOpacity 
            onPress={() => router.push('/(root)/profilePage')}
            className="w-20 h-20 items-center justify-center rounded-full bg-gray-100 overflow-hidden mb-2"
          >
            {profileImageUrl ? (
              <Image
                source={{ uri: profileImageUrl }}
                style={{ width: 80, height: 80, borderRadius: 40 }}
                resizeMode="cover"
              />
            ) : (
              <MaterialIcons name="person" size={40} color="#f97316" />
            )}
          </TouchableOpacity>
          <Text className="text-xl font-bold text-black mb-1 text-center">
            {user?.fullName || user?.firstName || t.user}
          </Text>
          {user?.primaryEmailAddress?.emailAddress && (
            <Text className="text-[15px] text-gray-500 text-center">{user.primaryEmailAddress.emailAddress}</Text>
          )}
        </View>

        {/* Decorative Orange Line */}
        <View className="h-[6px] w-full bg-orange-100 mb-4" />
      </View>

      {/* Menu Items */}
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          backgroundColor: '#fff',
          paddingHorizontal: 18,
          paddingTop: 2,
          paddingBottom: 5,
        }}
        className="rounded-tr-[2px] rounded-br-[22px]"
      >
        {/* Edit Profile */}
        <TouchableOpacity
          onPress={() => router.push('/(root)/profilePageEdit')}
          activeOpacity={0.7}
          className={`flex-row items-center mb-2 min-h-[44px] ${isRTL ? 'flex-row-reverse' : ''}`}
        >
          <View className={`w-9 h-9 rounded-full bg-orange-500 items-center justify-center ${isRTL ? 'ml-3.5' : 'mr-3.5'}`}>
            <MaterialIcons name="edit" size={22} color="#fff" />
          </View>
          <Text className={`text-base font-CairoBold text-gray-800 ${isRTL ? 'text-right' : 'text-left'}`}>{t.editProfile}</Text>
        </TouchableOpacity>

        {/* Language */}
        <TouchableOpacity
          onPress={toggleLanguage}
          activeOpacity={0.7}
          className={`flex-row items-center mb-2 min-h-[44px] ${isRTL ? 'flex-row-reverse' : ''}`}
        >
          <View className={`w-9 h-9 rounded-full bg-orange-500 items-center justify-center ${isRTL ? 'ml-3.5' : 'mr-3.5'}`}>
            <MaterialIcons name="translate" size={22} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className={`text-base font-CairoBold text-gray-800 ${isRTL ? 'text-right' : 'text-left'}`}>{t.language}</Text>
            <View className={`flex-row items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Text className={`text-gray-500 font-CairoRegular text-sm ${isRTL ? 'text-right ml-2' : 'text-left mr-2'}`}>
              {language === 'en' ? 'العربية' : 'English'}
            </Text>
              <MaterialIcons 
                name="swap-horiz" 
                size={16} 
                color="#6B7280" 
                style={{ transform: [{ rotate: isRTL ? '180deg' : '0deg' }] }}
              />
            </View>
          </View>
        </TouchableOpacity>

        {/* Location */}
        <TouchableOpacity
          onPress={() => router.push('/(root)/location')}
          activeOpacity={0.7}
          className={`flex-row items-center mb-2 min-h-[44px] ${isRTL ? 'flex-row-reverse' : ''}`}
        >
          <View className={`w-9 h-9 rounded-full bg-orange-500 items-center justify-center ${isRTL ? 'ml-3.5' : 'mr-3.5'}`}>
            <Image source={icons.pin} className='w-5 h-5' tintColor={"white"} resizeMode='contain'/>
          </View>
          <View className="flex-1">
            <Text className={`text-base font-CairoBold text-gray-800 ${isRTL ? 'text-right' : 'text-left'}`}>{t.location}</Text>
            <Text className={`text-gray-500 font-CairoRegular text-sm ${isRTL ? 'text-right' : 'text-left'}`}>
              {savedLocations.find(loc => loc.isDefault)?.name || userAddress || t.currentLocation}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: '#f3f4f6', marginVertical: 15 }} />

        {/* Track */}
        <TouchableOpacity
          onPress={() => {
            router.push('/(root)/track');
            props.navigation.closeDrawer();
          }}
          activeOpacity={0.7}
          className={`flex-row items-center mb-2 min-h-[44px] ${isRTL ? 'flex-row-reverse' : ''}`}
        >
          <View className={`w-9 h-9 rounded-full bg-orange-500 items-center justify-center ${isRTL ? 'ml-3.5' : 'mr-3.5'}`}>
            <MaterialIcons name="location-searching" size={22} color="#fff" />
          </View>
          <Text className={`text-base font-CairoBold text-gray-800 ${isRTL ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'تتبع رحلاتي' : 'Track Rides'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
            onPress={() => {
              router.push('/(root)/my-shares');
              props.navigation.closeDrawer();
            }}
            activeOpacity={0.7}
            className={`flex-row items-center mb-2 min-h-[44px] ${isRTL ? 'flex-row-reverse' : ''}`}
          >
            <View className={`w-9 h-9 rounded-full bg-orange-500 items-center justify-center ${isRTL ? 'ml-3.5' : 'mr-3.5'}`}>
              <MaterialIcons name="qr-code-scanner" size={22} color="#fff" />
            </View>
            <Text className={`text-base font-CairoBold text-gray-800 ${isRTL ? 'text-right' : 'text-left'}`}>
              {language === 'ar' ? 'إرسال موقعي' : 'Share My Location'}
            </Text>
          </TouchableOpacity>

        {/* New Rides - Only for drivers */}
        {isDriver && (
        <TouchableOpacity
          onPress={() => {
              router.push('/(root)/create-ride');
            props.navigation.closeDrawer();
          }}
          activeOpacity={0.7}
          className={`flex-row items-center mb-2 min-h-[44px] ${isRTL ? 'flex-row-reverse' : ''}`}
        >
          <View className={`w-9 h-9 rounded-full bg-orange-500 items-center justify-center ${isRTL ? 'ml-3.5' : 'mr-3.5'}`}>
              <MaterialIcons name="add-circle" size={22} color="#fff" />
          </View>
            <Text className={`text-base font-CairoBold text-gray-800 ${isRTL ? 'text-right' : 'text-left'}`}>
              {language === 'ar' ? 'ابدأ رحلة' : 'Create Ride'}
          </Text>
        </TouchableOpacity>
        )}

        {/* Barriers */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            props.navigation.navigate('tabs', { screen: 'barriers' });
            props.navigation.closeDrawer();
          }}
          activeOpacity={0.7}
          className={`flex-row items-center mb-2 min-h-[44px] ${isRTL ? 'flex-row-reverse' : ''}`}
        >
          <View className={`w-9 h-9 rounded-full bg-orange-500 items-center justify-center ${isRTL ? 'ml-3.5' : 'mr-3.5'}`}>
            <Image source={icons.barriers} resizeMode='contain' className='w-8 h-8' tintColor={"white"}/>
          </View>
          <Text className={`text-base font-CairoBold text-gray-800 ${isRTL ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'الحواجز' : 'Barriers'}
          </Text>
        </TouchableOpacity>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: '#f3f4f6', marginVertical: 15 }} />

        {/* Share App */}
        <View className="mb-1">
          <TouchableOpacity
            onPress={handleShare}
            activeOpacity={0.7}
            className={`flex-row items-center mb-2 min-h-[44px] ${isRTL ? 'flex-row-reverse' : ''}`}
          >
            <View className={`w-9 h-9 rounded-full bg-orange-500 items-center justify-center ${isRTL ? 'ml-3.5' : 'mr-3.5'}`}>
              <MaterialIcons name="share" size={22} color="#fff" />
            </View>
            <Text className={`text-base font-CairoBold text-gray-800 ${isRTL ? 'text-right' : 'text-left'}`}>{t.shareApp}</Text>
          </TouchableOpacity>


        </View>

        {/* Rate App */}
        <TouchableOpacity
          onPress={handleRate}
          activeOpacity={0.7}
          className={`flex-row items-center mb-2 min-h-[44px] ${isRTL ? 'flex-row-reverse' : ''}`}
        >
          <View className={`w-9 h-9 rounded-full bg-orange-500 items-center justify-center ${isRTL ? 'ml-3.5' : 'mr-3.5'}`}>
            <MaterialIcons name="star" size={22} color="#fff" />
          </View>
          <Text className={`text-base font-CairoBold text-gray-800 ${isRTL ? 'text-right' : 'text-left'}`}>{t.rateUs}</Text>
          </TouchableOpacity>

        {/* Privacy Policy */}
          <TouchableOpacity
            onPress={() => router.push('/(root)/privacy-policy')}
            activeOpacity={0.7}
            className={`flex-row items-center mb-2 min-h-[44px] ${isRTL ? 'flex-row-reverse' : ''}`}
          >
            <View className={`w-9 h-9 rounded-full bg-orange-500 items-center justify-center ${isRTL ? 'ml-3.5' : 'mr-3.5'}`}>
              <MaterialIcons name="privacy-tip" size={22} color="#fff" />
            </View>
          <Text className={`text-base font-CairoBold text-gray-800 ${isRTL ? 'text-right' : 'text-left'}`}>{t.privacyPolicy}</Text>
          </TouchableOpacity>

        {/* Help */}
          <TouchableOpacity
            onPress={() => router.push('/(root)/help')}
            activeOpacity={0.7}
            className={`flex-row items-center mb-2 min-h-[44px] ${isRTL ? 'flex-row-reverse' : ''}`}
          >
            <View className={`w-9 h-9 rounded-full bg-orange-500 items-center justify-center ${isRTL ? 'ml-3.5' : 'mr-3.5'}`}>
              <MaterialIcons name="help-outline" size={22} color="#fff" />
            </View>
          <Text className={`text-base font-CairoBold text-gray-800 ${isRTL ? 'text-right' : 'text-left'}`}>{t.helpAndSupport}</Text>
          </TouchableOpacity>

        {/* Divider */}
        <View style={{ height: 1, backgroundColor: '#f3f4f6', marginVertical: 15 }} />

        {/* Logout */}
        <TouchableOpacity
          onPress={handleSignOut}
          activeOpacity={0.7}
          className={`flex-row items-center mb-2 min-h-[44px] ${isRTL ? 'flex-row-reverse' : ''}`}
          style={{ backgroundColor: '#fee2e2', borderRadius: 12 }}
        >
          <View className={`w-9 h-9 rounded-full bg-red-100 items-center justify-center ${isRTL ? 'ml-3.5' : 'mr-3.5'}`}>
            <MaterialIcons name="logout" size={22} color="#ef4444" />
          </View>
          <Text className={`text-base font-CairoBold text-red-600 ${isRTL ? 'text-right' : 'text-left'}`}>{t.logout}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}