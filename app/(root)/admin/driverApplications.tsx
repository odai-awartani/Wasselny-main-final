import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, Alert, Modal, TextInput, ActivityIndicator, StyleSheet, Dimensions, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, getDoc, addDoc, orderBy, onSnapshot } from 'firebase/firestore';
import { useUser } from '@clerk/clerk-expo';
import CustomButton from '@/components/CustomButton';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
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

  const handleConfirm = () => {
    onConfirm();
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

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

  if (!visible) return null;

  return (
    <View style={styles.alertRoot}>
      <TouchableOpacity
        style={styles.alertOverlay}
        activeOpacity={1}
        onPress={handleCancel}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={styles.alertContent}
        >
          <Animated.View
            style={[
              styles.alertContainer,
              { transform: [{ scale: scaleAnim }] },
              { opacity: opacityAnim }
            ]}
          >
            <View style={[styles.alertHeader, { backgroundColor: typeStyles.bgColor }]}>
              <View style={styles.iconContainer}>
                <MaterialIcons name={typeStyles.icon as any} size={48} color={typeStyles.color} />
              </View>
              <Text className="text-xl font-CairoBold text-gray-800 text-center mb-2">
                {title}
              </Text>
              <Text className="text-base text-gray-600 text-center font-CairoRegular">
                {message}
              </Text>
            </View>

            <View style={styles.alertButtons}>
              {onCancel && (
                <TouchableOpacity
                  onPress={handleCancel}
                  style={styles.alertCancelButton}
                >
                  <Text style={styles.alertCancelButtonText}>
                    {cancelText}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleConfirm}
                style={[
                  styles.alertConfirmButton,
                  { backgroundColor: typeStyles.color },
                  onCancel ? { flex: 1 } : { width: '100%' }
                ]}
              >
                <Text style={styles.alertConfirmButtonText}>
                  {confirmText}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  alertRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContainer: {
    width: '85%',
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
  },
  alertHeader: {
    padding: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  alertMessage: {
    fontSize: 16,
    color: '#4b5563',
    textAlign: 'center',
  },
  alertButtons: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  alertCancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  alertConfirmButton: {
    paddingVertical: 16,
  },
  alertCancelButtonText: {
    fontSize: 16,
    color: '#4b5563',
    textAlign: 'center',
    fontWeight: '500',
  },
  alertConfirmButtonText: {
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
    fontWeight: '500',
  },
});

const SkeletonApplicationCard = ({ language }: { language: string }) => {
  const isRTL = language === 'ar';
  return (
    <View className="bg-white rounded-xl p-4 mb-4 shadow-sm border border-gray-100">
      <View className={`flex-row items-center mb-4 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
        <View className="w-16 h-16 bg-gray-200 rounded-full" />
        <View className={`flex-1 ${isRTL ? 'mr-4' : 'ml-4'}`}>
          <View className={`h-6 w-32 bg-gray-200 rounded mb-2 ${isRTL ? 'self-end' : 'self-start'}`} />
          <View className={`h-4 w-48 bg-gray-200 rounded mb-1 ${isRTL ? 'self-end' : 'self-start'}`} />
          <View className={`h-4 w-36 bg-gray-200 rounded ${isRTL ? 'self-end' : 'self-start'}`} />
        </View>
      </View>

      <View className="space-y-2 mb-4">
        <View className={`flex-row justify-between ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className="h-4 w-24 bg-gray-200 rounded" />
          <View className="h-4 w-32 bg-gray-200 rounded" />
        </View>
        <View className={`flex-row justify-between ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className="h-4 w-20 bg-gray-200 rounded" />
          <View className="h-4 w-16 bg-gray-200 rounded" />
        </View>
        <View className={`flex-row justify-between ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className="h-4 w-28 bg-gray-200 rounded" />
          <View className="h-4 w-36 bg-gray-200 rounded" />
        </View>
        <View className={`flex-row justify-between ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
          <View className="h-4 w-24 bg-gray-200 rounded" />
          <View className="h-4 w-32 bg-gray-200 rounded" />
        </View>
      </View>

      <View className="h-48 bg-gray-200 rounded-lg mb-4" />

      <View className={`flex-row justify-between ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
        <View className={`h-10 w-1/2 bg-gray-200 rounded-lg ${isRTL ? 'ml-2' : 'mr-2'}`} />
        <View className={`h-10 w-1/2 bg-gray-200 rounded-lg ${isRTL ? 'mr-2' : 'ml-2'}`} />
      </View>
    </View>
  );
};

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
  const [pendingCount, setPendingCount] = useState(0);

  // State for custom alert
  const [alertConfig, setAlertConfig] = useState<CustomAlertProps>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
    onCancel: undefined,
    confirmText: 'OK',
    cancelText: 'Cancel',
    type: 'info',
  });

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
          setAlertConfig({
            visible: true,
            title: language === 'ar' ? 'تم رفض الوصول' : 'Access Denied',
            message: language === 'ar' ? 'ليس لديك الإذن بالوصول إلى هذه الصفحة' : 'You do not have permission to access this page',
            type: 'error',
            onConfirm: () => {
              setAlertConfig(prev => ({ ...prev, visible: false }));
              router.replace('/(root)/(tabs)/home');
            },
            confirmText: 'OK',
            onCancel: undefined,
          });
        }
      } else {
        setAlertConfig({
          visible: true,
          title: language === 'ar' ? 'تم رفض الوصول' : 'Access Denied',
          message: language === 'ar' ? 'ليس لديك الإذن بالوصول إلى هذه الصفحة' : 'You do not have permission to access this page',
          type: 'error',
          onConfirm: () => {
            setAlertConfig(prev => ({ ...prev, visible: false }));
            router.replace('/(root)/(tabs)/home');
          },
          confirmText: 'OK',
          onCancel: undefined,
        });
      }
    } catch (error) {
      console.error('Error checking admin access:', error);
      setAlertConfig({
        visible: true,
        title: language === 'ar' ? 'خطأ' : 'Error',
        message: language === 'ar' ? 'حدث خطأ أثناء التحقق من الصلاحيات' : 'An error occurred while checking permissions',
        type: 'error',
        onConfirm: () => {
          setAlertConfig(prev => ({ ...prev, visible: false }));
          router.replace('/(root)/(tabs)/home');
        },
        confirmText: 'OK',
        onCancel: undefined,
      });
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
      setAlertConfig({
        visible: true,
        title: language === 'ar' ? 'خطأ' : 'Error',
        message: language === 'ar' ? 'حدث خطأ أثناء جلب الطلبات' : 'An error occurred while fetching applications',
        type: 'error',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: 'OK',
        onCancel: undefined,
      });
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
        title: language === 'ar' ? 'تمت الموافقة على طلب السائق' : 'Driver Application Approved',
        message: language === 'ar' 
          ? 'تهانينا! تمت الموافقة على طلبك كسائق. يمكنك الآن البدء في تقديم خدمات النقل.'
          : 'Congratulations! Your driver application has been approved. You can now start providing transportation services.',
        created_at: new Date(),
        read: false,
        user_id: applicationId,
        data: {
          status: 'approved'
        }
      });

      await fetchApplications();

      setAlertConfig({
        visible: true,
        title: language === 'ar' ? 'نجاح' : 'Success',
        message: language === 'ar' ? 'تمت الموافقة على طلب السائق بنجاح' : 'Driver application approved successfully',
        type: 'success',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: 'OK',
        onCancel: undefined,
      });
    } catch (error) {
      console.error('Error handling application:', error);
      setAlertConfig({
        visible: true,
        title: language === 'ar' ? 'خطأ' : 'Error',
        message: language === 'ar' ? 'حدث خطأ أثناء معالجة الطلب' : 'An error occurred while processing the application',
        type: 'error',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: 'OK',
        onCancel: undefined,
      });
    }
  };

  const handleReject = async () => {
    if (!selectedApplication || !rejectionReason.trim()) {
      setAlertConfig({
        visible: true,
        title: language === 'ar' ? 'خطأ' : 'Error',
        message: language === 'ar' ? 'الرجاء إدخال سبب الرفض' : 'Please enter a rejection reason',
        type: 'warning', // Use warning for validation message
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: 'OK',
        onCancel: undefined,
      });
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

      // Get admin user ID
      const adminQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
      const adminSnapshot = await getDocs(adminQuery);
      const adminDoc = adminSnapshot.docs[0];
      
      if (!adminDoc) {
        throw new Error('Admin user not found');
      }

      const notificationsRef = collection(db, 'notifications');
      await addDoc(notificationsRef, {
        type: 'driver_status',
        title: language === 'ar' ? 'تم رفض طلب السائق' : 'Driver Application Rejected',
        message: language === 'ar' 
          ? `تم رفض طلبك كسائق للأسباب التالية:\n${rejectionReason.trim()}\n\nيمكنك تحديث معلوماتك وإعادة التقديم.`
          : `Your driver application has been rejected for the following reasons:\n${rejectionReason.trim()}\n\nYou can update your information and reapply.`,
        created_at: new Date(),
        read: false,
        user_id: selectedApplication.id,
        data: {
          status: 'rejected',
          rejection_reason: rejectionReason.trim(),
          type: 'driver_status'
        }
      });

      await fetchApplications();

      setShowRejectionModal(false);
      setRejectionReason('');
      setSelectedApplication(null);

      setAlertConfig({
        visible: true,
        title: language === 'ar' ? 'نجاح' : 'Success',
        message: language === 'ar' ? 'تم رفض طلب السائق بنجاح' : 'Driver application rejected successfully',
        type: 'success',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: 'OK',
        onCancel: undefined,
      });
    } catch (error) {
      console.error('Error rejecting application:', error);
      setAlertConfig({
        visible: true,
        title: language === 'ar' ? 'خطأ' : 'Error',
        message: language === 'ar' ? 'حدث خطأ أثناء رفض الطلب' : 'An error occurred while rejecting the application',
        type: 'error',
        onConfirm: () => setAlertConfig(prev => ({ ...prev, visible: false })),
        confirmText: 'OK',
        onCancel: undefined,
      });
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
          <SkeletonApplicationCard language={language} />
          <SkeletonApplicationCard language={language} />
          <SkeletonApplicationCard language={language} />
          <SkeletonApplicationCard language={language} />
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
                <View className={`flex-1 ${language === 'ar' ? 'mr-4 items-end' : 'ml-4 items-start'}`}>
                  <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
                    {application.user_name}
                  </Text>
                  <Text className={`text-gray-500 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                    {application.user_email}
                  </Text>
                  <Text className={`text-gray-500 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                    {application.phone_number}
                  </Text>
                </View>
              </View>

              <View className="space-y-2 mb-4">
                <View className={`flex-row justify-between ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <Text className={`text-gray-500 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                    {language === 'ar' ? 'نوع السيارة:' : 'Car Type:'}
                  </Text>
                  <Text className={`${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                    {application.car_type}
                  </Text>
                </View>
                <View className={`flex-row justify-between ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <Text className={`text-gray-500 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                    {language === 'ar' ? 'المقاعد:' : 'Seats:'}
                  </Text>
                  <Text className={`${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
                    {application.car_seats}
                  </Text>
                </View>
                
                <View className={`flex-row justify-between ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <Text className={`text-gray-500 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
                    {language === 'ar' ? 'تاريخ التقديم:' : 'Applied on:'}
                  </Text>
                  <Text className={`${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
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
                <View className={`flex-row justify-between ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
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
            <Text className={`text-xl ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} mb-4`}>
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

            <View className={`flex-row justify-between ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <CustomButton
                title={language === 'ar' ? 'إلغاء' : 'Cancel'}
                onPress={() => {
                  setShowRejectionModal(false);
                  setRejectionReason('');
                  setSelectedApplication(null);
                }}
                bgVariant="secondary"
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

      {/* Modal for CustomAlert */}
      <Modal
        visible={alertConfig.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      >
        {/* Render CustomAlert component */}
        <CustomAlert
          visible={true} // Always visible when the wrapping modal is visible
          title={alertConfig.title}
          message={alertConfig.message}
          type={alertConfig.type}
          onConfirm={alertConfig.onConfirm}
          onCancel={alertConfig.onCancel}
          confirmText={alertConfig.confirmText}
          cancelText={alertConfig.cancelText}
        />
      </Modal>
    </SafeAreaView>
  );
};

export default DriverApplications; 