import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Platform, ActivityIndicator, Modal, Dimensions, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { icons } from '@/constants';
import Header from '@/components/Header';
import { useLanguage } from '@/context/LanguageContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { PALESTINIAN_CITIES, CityData, BarrierData } from '@/constants/cities';
import { useUser } from '@clerk/clerk-expo';
import { MaterialIcons } from '@expo/vector-icons';

interface BarrierUpdate {
  status: 'open' | 'closed' | 'delayed' | 'heavy_traffic' | 'military_presence' | 'random_check' | 'smooth_traffic';
  description: string;
  updated_at: any;
}

interface Barrier {
  id: string;
  barrier: string;
  description: string;
  location: string;
  city: string;
  status: 'open' | 'closed' | 'delayed' | 'heavy_traffic' | 'military_presence' | 'random_check' | 'smooth_traffic';
  imageUrl: string | null;
  created_at: any;
  updated_at: any;
  updates?: BarrierUpdate[];
}

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

const STATUS_OPTIONS = {
  open: {
    en: 'Open',
    ar: 'مفتوح',
    color: '#22c55e'
  },
  closed: {
    en: 'Closed',
    ar: 'مغلق',
    color: '#ef4444'
  },
  open_inward: {
    en: 'Open Inward',
    ar: 'مفتوح للداخل',
    color: '#22c55e'
  },
  open_outward: {
    en: 'Open Outward',
    ar: 'مفتوح للخارج',
    color: '#22c55e'
  },
  closed_inward: {
    en: 'Closed Inward',
    ar: 'مغلق للداخل',
    color: '#ef4444'
  },
  closed_outward: {
    en: 'Closed Outward',
    ar: 'مغلق للخارج',
    color: '#ef4444'
  },
  crisis_inward: {
    en: 'Crisis Inward',
    ar: 'ازمة للداخل',
    color: '#dc2626'
  },
  crisis_outward: {
    en: 'Crisis Outward',
    ar: 'ازمة للخارج',
    color: '#dc2626'
  },
  heavy_traffic: {
    en: 'Heavy Traffic',
    ar: 'كثافة سير',
    color: '#f97316'
  },
  open_with_id_check: {
    en: 'Open with ID Check',
    ar: 'مفتوح مع تفتيش هويات',
    color: '#f59e0b'
  },
  random_check: {
    en: 'Open with Random Check',
    ar: 'مفتوح مع تفتيش عشوائي',
    color: '#f59e0b'
  },
  settler_presence: {
    en: 'Settler Presence',
    ar: 'تواجد مستوطنين',
    color: '#dc2626'
  },
  heavy_traffic_with_police: {
    en: 'Heavy Traffic with Police',
    ar: 'كثافة سير وشرطة',
    color: '#dc2626'
  }
};

const CustomAlert = ({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'OK',
  cancelText = 'Cancel',
  type = 'info'
}: CustomAlertProps) => {
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
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
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true
        }),
        Animated.spring(scaleAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 7
        })
      ]).start();
    }
  }, [visible]);

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return {
          icon: 'check-circle',
          color: '#22c55e',
          bgColor: '#dcfce7'
        };
      case 'error':
        return {
          icon: 'error',
          color: '#ef4444',
          bgColor: '#fee2e2'
        };
      case 'warning':
        return {
          icon: 'warning',
          color: '#f97316',
          bgColor: '#ffedd5'
        };
      default:
        return {
          icon: 'info',
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
          style={[
            { transform: [{ scale: scaleAnim }] },
            { opacity: opacityAnim }
          ]}
        >
          <View className={`p-6 ${typeStyles.bgColor}`}>
            <View className="items-center mb-4">
              <MaterialIcons name={typeStyles.icon as any} size={48} color={typeStyles.color} />
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

const BarrierDetails = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { t, language } = useLanguage();
  const [barrier, setBarrier] = useState<Barrier | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const { user } = useUser();
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    onConfirm: () => {},
    confirmText: undefined as string | undefined,
    onCancel: undefined as (() => void) | undefined,
  });

  useEffect(() => {
    const fetchBarrierDetails = async () => {
      try {
        const barrierRef = doc(db, 'barriers', id as string);
        const barrierDoc = await getDoc(barrierRef);
        
        if (barrierDoc.exists()) {
          setBarrier({
            id: barrierDoc.id,
            ...barrierDoc.data()
          } as Barrier);
        }
      } catch (error) {
        console.error('Error fetching barrier details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBarrierDetails();
  }, [id]);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!user?.id) return;
      
      try {
        const userRef = doc(db, 'users', user.id);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const imageUrl = userData.profile_image_url || userData.driver?.profile_image_url || null;
          setProfileImageUrl(imageUrl);
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
      }
    };

    fetchUserProfile();
  }, [user?.id]);

  const getStatusColor = (status: string) => {
    return STATUS_OPTIONS[status as keyof typeof STATUS_OPTIONS]?.color || 'bg-gray-500';
  };

  const getStatusText = (status: string) => {
    if (language === 'ar') {
      return STATUS_OPTIONS[status as keyof typeof STATUS_OPTIONS]?.ar || status;
    }
    return STATUS_OPTIONS[status as keyof typeof STATUS_OPTIONS]?.en || status;
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return { date: 'N/A', time: 'N/A' };
    
    let date: Date;
    if (timestamp.seconds) {
      // Handle Firestore timestamp
      date = new Date(timestamp.seconds * 1000);
    } else if (typeof timestamp === 'number') {
      // Handle our custom timestamp
      date = new Date(timestamp);
    } else {
      return { date: 'N/A', time: 'N/A' };
    }

    const dateStr = date.toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const timeStr = date.toLocaleString(language === 'ar' ? 'en-US' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return { date: dateStr, time: timeStr };
  };

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f4f4f4' }}>
        <Header title={language === 'ar' ? 'تفاصيل الحاجز' : 'Barrier Details' } showSideMenu={false} />
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#f97316" />
        </View>
      </SafeAreaView>
    );
  }

  if (!barrier) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f4f4f4' }}>
        <Header title={language === 'ar' ? 'تفاصيل الحاجز' : 'Barrier Details' } showSideMenu={false} />
        <View className="flex-1 justify-center items-center">
          <Text className={`text-gray-500 ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
            {language === 'ar' ? 'لم يتم العثور على الحاجز' : 'Barrier not found'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: '#f4f4f4' }}>
      <Header 
        title={language === 'ar' ? 'تفاصيل الحاجز' : 'Barrier Details'} 
        showSideMenu={false}
        profileImageUrl={profileImageUrl}
        showProfileImage={true}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingBottom: 100,
        }}
      >
        {loading ? (
          <View className="flex-1 justify-center items-center py-8">
            <ActivityIndicator size="large" color="#f97316" />
          </View>
        ) : barrier ? (
          <View className="px-4 py-4">
            {/* Section Title */}
            <Text className={`text-xl mx-2 my-2 font-CairoBold ${language === 'ar' ? 'text-right' : 'text-left'} text-gray-800`}>
              {language === 'ar' ? 'آخر تحديث' : 'Last Update'}
            </Text>

            {/* Barrier Info */}
            <View className="bg-white p-4 rounded-xl mb-4 border border-gray-200">
              <View className={`flex-row ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} justify-between items-center mb-3`}>
                <View className="flex-1 mr-2">
                  <Text className={`text-xl ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} ${language === 'ar' ? 'text-right' : 'text-left'} text-gray-800`}>
                    {language === 'ar' 
                      ? PALESTINIAN_CITIES[barrier.city]?.barriers.find((b: BarrierData) => b.en === barrier.barrier)?.ar || barrier.barrier
                      : barrier.barrier
                    }
                  </Text>
                  <Text className={`text-base ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'} ${language === 'ar' ? 'text-right' : 'text-left'} text-gray-500 mt-1`}>
                    {language === 'ar'
                      ? PALESTINIAN_CITIES[barrier.city]?.ar || barrier.city
                      : barrier.city
                    }
                  </Text>
                </View>
                <View 
                  className="px-4 py-2 rounded-full"
                  style={{ backgroundColor: getStatusColor(barrier.status) }}
                >
                  <Text className="text-white text-base font-CairoBold" numberOfLines={1}>
                    {getStatusText(barrier.status)}
                  </Text>
                </View>
              </View>
              {barrier.imageUrl && (
                <TouchableOpacity 
                  onPress={() => setSelectedImage(barrier.imageUrl)}
                  className="mb-3"
                >
                  <Image
                    source={{ uri: barrier.imageUrl }}
                    className="w-full h-40 rounded-lg"
                    resizeMode="cover"
                    onError={(error) => {
                      console.error('Main image loading error:', error.nativeEvent.error);
                      console.error('Failed image URL:', barrier.imageUrl);
                    }}
                  />
                </TouchableOpacity>
              )}
              {barrier.description && (
                <Text className={`text-gray-600 mb-3 text-base font-CairoRegular ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {barrier.description}
                </Text>
              )}
              <View className={`flex-row ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} items-center bg-gray-50 p-3 rounded-lg`}>
                <View className={`flex-row ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} items-center flex-1`}>
                  <Text className={`text-gray-600 text-sm font-CairoBold ${language === 'ar' ? 'text-right' : 'text-left'} flex-1`}>
                    {language === 'ar' ? 'آخر تحديث: ' : 'Last Updated: '}
                    {formatDate(barrier.updated_at).date}
                  </Text>
                  <View className="bg-white px-3 py-1 rounded-full mx-2 border border-gray-200">
                    <Text className="text-orange-600 text-sm font-CairoBold">
                      {formatDate(barrier.updated_at).time}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Update History */}
            <Text className={`text-xl mx-2 my-2 font-CairoBold ${language === 'ar' ? 'text-right' : 'text-left'} text-gray-800`}>
              {language === 'ar' ? 'سجل التحديثات' : 'Update History'}
            </Text>
            {barrier.updates && barrier.updates.length > 0 && (
              <View className="bg-white p-4 rounded-xl border border-gray-200">
                {[...barrier.updates]
                  .sort((a, b) => {
                    const dateA = a.updated_at?.seconds ? new Date(a.updated_at.seconds * 1000) : new Date(0);
                    const dateB = b.updated_at?.seconds ? new Date(b.updated_at.seconds * 1000) : new Date(0);
                    return dateB.getTime() - dateA.getTime();
                  })
                  .map((update: any, index: number) => (
                    <View key={index} className="mb-4 pb-4 border-b border-gray-200 last:border-b-0 last:mb-0 last:pb-0">
                      <View className={`flex-row ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} justify-between items-center mb-2`}>
                        <View 
                          className="px-4 py-2 rounded-full"
                          style={{ backgroundColor: getStatusColor(update.status) }}
                        >
                          <Text className="text-white text-base font-CairoBold" numberOfLines={1}>
                            {getStatusText(update.status)}
                          </Text>
                        </View>
                      </View>
                      <View className={`flex-row ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} items-center bg-gray-50 p-3 rounded-lg mb-2`}>
                        <View className={`flex-row ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} items-center flex-1`}>
                          <Text className={`text-gray-600 text-sm font-CairoBold ${language === 'ar' ? 'text-right' : 'text-left'} flex-1`}>
                            {formatDate(update.updated_at).date}
                          </Text>
                          <View className="bg-white px-3 py-1 rounded-full mx-2 border border-gray-200">
                            <Text className="text-orange-600 text-sm font-CairoBold">
                              {formatDate(update.updated_at).time}
                            </Text>
                          </View>
                        </View>
                      </View>
                      {update.description && (
                        <Text className={`text-gray-600 text-base font-CairoRegular ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                          {update.description}
                        </Text>
                      )}
                    </View>
                  ))}
              </View>
            )}
          </View>
        ) : (
          <View className="flex-1 justify-center items-center py-8">
            <Text className={`text-gray-500 ${language === 'ar' ? 'font-CairoBold text-center' : 'font-JakartaBold text-center'}`}>
              {language === 'ar' ? 'لم يتم العثور على الحاجز' : 'Barrier not found'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Image Preview Modal */}
      <Modal
        visible={!!selectedImage}
        transparent={true}
        onRequestClose={() => setSelectedImage(null)}
      >
        <TouchableOpacity 
          className="flex-1 bg-black/90 items-center justify-center"
          onPress={() => setSelectedImage(null)}
          activeOpacity={1}
        >
          {selectedImage && (
            <Image
              source={{ uri: selectedImage }}
              className="w-full h-full rounded-xl"
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </Modal>

      {/* Custom Alert */}
      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        onConfirm={alertConfig.onConfirm}
        onCancel={alertConfig.onCancel}
        confirmText={alertConfig.confirmText}
        cancelText={alertConfig.cancelText}
        type={alertConfig.type}
      />
    </SafeAreaView>
  );
};

export default BarrierDetails; 