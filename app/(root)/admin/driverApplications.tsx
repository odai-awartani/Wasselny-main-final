import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Alert, Modal, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, getDoc, addDoc, orderBy } from 'firebase/firestore';
import { useUser } from '@clerk/clerk-expo';
import CustomButton from '@/components/CustomButton';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import Header from '@/components/Header';

interface DriverApplication {
  id: string;
  car_type: string;
  car_image_url: string;
  profile_image_url: string;
  car_seats: number;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  user_id: string;
  user_name: string;
  user_email: string;
  phone_number?: string;
  license_number?: string;
}

const SkeletonApplicationCard = () => (
  <View className="bg-white rounded-xl p-4 mb-4 shadow-sm border border-gray-100">
    <View className="flex-row items-center mb-4">
      <View className="w-16 h-16 bg-gray-200 rounded-full" />
      <View className="flex-1 ml-4">
        <View className="h-6 w-32 bg-gray-200 rounded mb-2" />
        <View className="h-4 w-48 bg-gray-200 rounded mb-1" />
        <View className="h-4 w-36 bg-gray-200 rounded" />
      </View>
    </View>

    <View className="space-y-2 mb-4">
      <View className="flex-row justify-between">
        <View className="h-4 w-24 bg-gray-200 rounded" />
        <View className="h-4 w-32 bg-gray-200 rounded" />
      </View>
      <View className="flex-row justify-between">
        <View className="h-4 w-20 bg-gray-200 rounded" />
        <View className="h-4 w-16 bg-gray-200 rounded" />
      </View>
      <View className="flex-row justify-between">
        <View className="h-4 w-28 bg-gray-200 rounded" />
        <View className="h-4 w-36 bg-gray-200 rounded" />
      </View>
      <View className="flex-row justify-between">
        <View className="h-4 w-24 bg-gray-200 rounded" />
        <View className="h-4 w-32 bg-gray-200 rounded" />
      </View>
    </View>

    <View className="h-48 bg-gray-200 rounded-lg mb-4" />

    <View className="flex-row justify-between">
      <View className="h-10 w-1/2 bg-gray-200 rounded-lg mr-2" />
      <View className="h-10 w-1/2 bg-gray-200 rounded-lg ml-2" />
    </View>
  </View>
);

const DriverApplications = () => {
  const { user } = useUser();
  const { language } = useLanguage();
  const [applications, setApplications] = useState<DriverApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<DriverApplication | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');

  useEffect(() => {
    checkAdminAccess();
  }, [user]);

  const checkAdminAccess = async () => {
    if (!user?.id) {
      router.replace('/(auth)/sign-in');
      return;
    }

    try {
      const userRef = doc(db, 'users', user.id);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.role === 'admin') {
          setIsAdmin(true);
          fetchApplications();
        } else {
          Alert.alert('Access Denied', 'You do not have permission to access this page');
          router.replace('/(root)/(tabs)/home');
        }
      } else {
        Alert.alert('Access Denied', 'You do not have permission to access this page');
        router.replace('/(root)/(tabs)/home');
      }
    } catch (error) {
      console.error('Error checking admin access:', error);
      Alert.alert('Error', 'An error occurred while checking permissions');
      router.replace('/(root)/(tabs)/home');
    }
  };

  const fetchApplications = async () => {
    try {
      const usersRef = collection(db, 'users');
      let q;
      
      if (filter === 'all') {
        q = query(usersRef, where('driver', '!=', null));
      } else {
        q = query(usersRef, where('driver.status', '==', filter));
      }

      const querySnapshot = await getDocs(q);
      
      const applicationsList: DriverApplication[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.driver) {
          applicationsList.push({
            id: doc.id,
            ...data.driver,
            user_name: data.name || 'Unknown',
            user_email: data.email || 'No email',
            phone_number: data.phone_number || data.phone || 'Not provided'
          });
        }
      });
      
      const sortedApplications = sortApplications(applicationsList);
      setApplications(sortedApplications);
    } catch (error) {
      console.error('Error fetching applications:', error);
      Alert.alert('Error', 'An error occurred while fetching applications');
    } finally {
      setLoading(false);
    }
  };

  const sortApplications = (apps: DriverApplication[]) => {
    return [...apps].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;

      if (sortBy === 'date') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return a.user_name.localeCompare(b.user_name);
    });
  };

  useEffect(() => {
    if (isAdmin) {
      fetchApplications();
    }
  }, [filter, sortBy]);

  const handleApplication = async (applicationId: string, action: 'approve' | 'reject') => {
    if (action === 'reject') {
      const application = applications.find(app => app.id === applicationId);
      if (application) {
        setSelectedApplication(application);
        setShowRejectionModal(true);
      }
      return;
    }

    try {
      const userRef = doc(db, 'users', applicationId);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data();
      
      await updateDoc(userRef, {
        'driver.status': 'approved',
        'driver.is_active': true,
        'driver.rejection_reason': null,
        'driver.approved_at': new Date().toISOString()
      });

      const notificationsRef = collection(db, 'notifications');
      await addDoc(notificationsRef, {
        type: 'driver_status',
        title: 'Driver Application Approved',
        message: 'Congratulations! Your driver application has been approved. You can now start providing transportation services.',
        created_at: new Date(),
        read: false,
        user_id: applicationId,
        data: {
          status: 'approved'
        }
      });

      await fetchApplications();

      Alert.alert('Success', 'Driver application approved successfully');
    } catch (error) {
      console.error('Error handling application:', error);
      Alert.alert('Error', 'An error occurred while processing the application');
    }
  };

  const handleReject = async () => {
    if (!selectedApplication || !rejectionReason.trim()) {
      Alert.alert('Error', 'Please enter a rejection reason');
      return;
    }

    try {
      const userRef = doc(db, 'users', selectedApplication.id);
      await updateDoc(userRef, {
        'driver.status': 'rejected',
        'driver.is_active': false,
        'driver.rejection_reason': rejectionReason.trim(),
        'driver.rejected_at': new Date().toISOString()
      });

      const notificationsRef = collection(db, 'notifications');
      await addDoc(notificationsRef, {
        type: 'driver_status',
        title: 'Driver Application Rejected',
        message: `Your driver application has been rejected for the following reasons:\n${rejectionReason.trim()}\n\nYou can update your information and reapply.`,
        created_at: new Date(),
        read: false,
        user_id: selectedApplication.id,
        data: {
          status: 'rejected',
          rejection_reason: rejectionReason.trim()
        }
      });

      await fetchApplications();

      setShowRejectionModal(false);
      setRejectionReason('');
      setSelectedApplication(null);

      Alert.alert('Success', 'Driver application rejected successfully');
    } catch (error) {
      console.error('Error rejecting application:', error);
      Alert.alert('Error', 'An error occurred while rejecting the application');
    }
  };

  const FilterButton = ({ title, value }: { title: string; value: typeof filter }) => (
    <TouchableOpacity
      onPress={() => setFilter(value)}
      className={`px-4 py-2 rounded-full ${language === 'ar' ? 'ml-2' : 'mr-2'} ${
        filter === value ? 'bg-orange-500' : 'bg-gray-200'
      }`}
    >
      <Text className={`${filter === value ? 'text-white' : 'text-gray-700'} ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  const SortButton = ({ title, value }: { title: string; value: typeof sortBy }) => (
    <TouchableOpacity
      onPress={() => setSortBy(value)}
      className={`px-4 py-2 rounded-full ${language === 'ar' ? 'ml-2' : 'mr-2'} ${
        sortBy === value ? 'bg-blue-500' : 'bg-gray-200'
      }`}
    >
      <Text className={`${sortBy === value ? 'text-white' : 'text-gray-700'} ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  if (!isAdmin) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#F97316" />
        <Text className={`text-lg mt-4 ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
          {language === 'ar' ? 'جاري التحقق من الصلاحيات...' : 'Checking permissions...'}
        </Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Header 
          showProfileImage={false} 
          showSideMenu={false} 
          title={language === 'ar' ? 'طلبات السائقين' : 'Driver Applications'} 
        />
        
        <View className="px-4 py-4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ flexDirection: language === 'ar' ? 'row-reverse' : 'row' }}>
            <View className="h-10 w-20 bg-gray-200 rounded-full mr-2" />
            <View className="h-10 w-24 bg-gray-200 rounded-full mr-2" />
            <View className="h-10 w-28 bg-gray-200 rounded-full mr-2" />
            <View className="h-10 w-24 bg-gray-200 rounded-full" />
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ flexDirection: language === 'ar' ? 'row-reverse' : 'row' }}>
            <View className="h-10 w-32 bg-gray-200 rounded-full mr-2" />
            <View className="h-10 w-28 bg-gray-200 rounded-full" />
          </ScrollView>
        </View>

        <ScrollView className="flex-1 px-4">
          <SkeletonApplicationCard />
          <SkeletonApplicationCard />
          <SkeletonApplicationCard />
          <SkeletonApplicationCard />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Header 
        showProfileImage={false} 
        showSideMenu={false} 
        title={language === 'ar' ? 'طلبات السائقين' : 'Driver Applications'} 
      />
      
      <View className="px-4 py-4">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ flexDirection: language === 'ar' ? 'row-reverse' : 'row' }}>
          <FilterButton title={language === 'ar' ? 'الكل' : 'All'} value="all" />
          <FilterButton title={language === 'ar' ? 'قيد الانتظار' : 'Pending'} value="pending" />
          <FilterButton title={language === 'ar' ? 'تمت الموافقة' : 'Approved'} value="approved" />
          <FilterButton title={language === 'ar' ? 'مرفوض' : 'Rejected'} value="rejected" />
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ flexDirection: language === 'ar' ? 'row-reverse' : 'row' }}>
          <SortButton title={language === 'ar' ? 'ترتيب حسب التاريخ' : 'Sort by Date'} value="date" />
          <SortButton title={language === 'ar' ? 'ترتيب حسب الاسم' : 'Sort by Name'} value="name" />
        </ScrollView>
      </View>

      <ScrollView className="flex-1 px-4">
        {applications.length === 0 ? (
          <View className="flex-1 items-center justify-center py-8">
            <MaterialCommunityIcons name="file-document-outline" size={48} color="#9CA3AF" />
            <Text className={`text-lg text-gray-500 mt-4 ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
              {language === 'ar' ? 'لا توجد طلبات' : 'No applications found'}
            </Text>
          </View>
        ) : (
          applications.map((application) => (
            <View 
              key={application.id}
              className="bg-white rounded-xl p-4 mb-4 shadow-sm border border-gray-100"
            >
              <View className={`flex-row items-center mb-4 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedImage(application.profile_image_url);
                    setShowImageModal(true);
                  }}
                >
                  <Image
                    source={{ uri: application.profile_image_url }}
                    className="w-16 h-16 rounded-full"
                  />
                </TouchableOpacity>
                <View className={`flex-1 ${language === 'ar' ? 'mr-4' : 'ml-4'}`}>
                  <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                    {application.user_name}
                  </Text>
                  <Text className={`text-gray-500 ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                    {application.user_email}
                  </Text>
                  <Text className={`text-gray-500 ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                    {application.phone_number}
                  </Text>
                </View>
              </View>

              <View className="space-y-2 mb-4">
                <View className="flex-row justify-between">
                  <Text className={`text-gray-500 ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                    {language === 'ar' ? 'نوع السيارة:' : 'Car Type:'}
                  </Text>
                  <Text className={`${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                    {application.car_type}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className={`text-gray-500 ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                    {language === 'ar' ? 'المقاعد:' : 'Seats:'}
                  </Text>
                  <Text className={`${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                    {application.car_seats}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className={`text-gray-500 ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                    {language === 'ar' ? 'رقم الترخيص:' : 'License Number:'}
                  </Text>
                  <Text className={`${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                    {application.license_number || (language === 'ar' ? 'غير متوفر' : 'Not provided')}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className={`text-gray-500 ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                    {language === 'ar' ? 'تاريخ التقديم:' : 'Applied on:'}
                  </Text>
                  <Text className={`${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                    {new Date(application.created_at).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US')}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => {
                  setSelectedImage(application.car_image_url);
                  setShowImageModal(true);
                }}
                className="mb-4"
              >
                <Image
                  source={{ uri: application.car_image_url }}
                  className="w-full h-48 rounded-lg"
                  resizeMode="cover"
                />
                <View className="absolute inset-0 bg-black/20 rounded-lg items-center justify-center">
                  <MaterialCommunityIcons name="magnify-plus-outline" size={32} color="white" />
                </View>
              </TouchableOpacity>

              {application.status === 'pending' && (
                <View className="flex-row justify-between">
                  <CustomButton
                    title={language === 'ar' ? 'رفض' : 'Reject'}
                    onPress={() => handleApplication(application.id, 'reject')}
                    bgVariant="danger"
                    className={`flex-1 ${language === 'ar' ? 'ml-2' : 'mr-2'}`}
                  />
                  <CustomButton
                    title={language === 'ar' ? 'موافقة' : 'Approve'}
                    onPress={() => handleApplication(application.id, 'approve')}
                    bgVariant="success"
                    className={`flex-1 ${language === 'ar' ? 'mr-2' : 'ml-2'}`}
                  />
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Modal
        visible={showRejectionModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowRejectionModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-center items-center">
          <View className="bg-white w-11/12 rounded-xl p-6">
            <Text className={`text-xl ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} mb-4`}>
              {language === 'ar' ? 'سبب الرفض' : 'Rejection Reason'}
            </Text>
            
            <TextInput
              value={rejectionReason}
              onChangeText={setRejectionReason}
              placeholder={language === 'ar' ? 'أدخل سبب الرفض' : 'Enter rejection reason'}
              multiline
              numberOfLines={4}
              className={`border border-gray-300 rounded-lg p-3 mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}
              textAlignVertical="top"
            />

            <View className="flex-row justify-between">
              <CustomButton
                title={language === 'ar' ? 'إلغاء' : 'Cancel'}
                onPress={() => {
                  setShowRejectionModal(false);
                  setRejectionReason('');
                  setSelectedApplication(null);
                }}
                bgVariant="outline"
                className={`flex-1 ${language === 'ar' ? 'ml-2' : 'mr-2'}`}
              />
              <CustomButton
                title={language === 'ar' ? 'رفض' : 'Reject'}
                onPress={handleReject}
                bgVariant="danger"
                className={`flex-1 ${language === 'ar' ? 'mr-2' : 'ml-2'}`}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showImageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowImageModal(false)}
      >
        <TouchableOpacity 
          className="flex-1 bg-black/90 justify-center items-center"
          activeOpacity={1}
          onPress={() => setShowImageModal(false)}
        >
          <Image
            source={{ uri: selectedImage }}
            className="w-full h-96"
            resizeMode="contain"
          />
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

export default DriverApplications; 