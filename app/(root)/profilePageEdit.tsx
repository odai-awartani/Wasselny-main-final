import React, { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { Image, ScrollView, Text, View, TouchableOpacity, Alert, ActivityIndicator, RefreshControl, Modal, TextInput, Switch, Share, Platform, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLanguage } from '@/context/LanguageContext';
import { AntDesign, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useRouter, Stack } from "expo-router";
import { doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { uploadImageToCloudinary } from "@/lib/upload";
import * as ImagePicker from "expo-image-picker";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { useProfile } from '@/context/ProfileContext';

interface UserData {
  driver?: {
    is_active: boolean;
    car_type: string;
    car_seats: number;
    car_image_url: string;
    profile_image_url: string;
    created_at: string;
  };
  profile_image_url?: string;
  role?: string;
}

const ProfileEdit = () => {
  const { user } = useUser();
  const { signOut } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();
  const storage = getStorage();
  const { refreshProfileImage } = useProfile();

  const [userData, setUserData] = useState<{
    isDriver: boolean;
    isLoading: boolean;
    profileImage: string | null;
    data: UserData | null;
    isAdmin: boolean;
  }>({
    isDriver: false,
    isLoading: true,
    profileImage: null,
    data: null,
    isAdmin: false,
  });

  const [isUploading, setIsUploading] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const [showFullCarImage, setShowFullCarImage] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    carType: '',
    carSeats: '',
    phoneNumber: '',
  });

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const phoneNumber = user?.unsafeMetadata?.phoneNumber as string || "+972342423423";

  // Add new state for edit modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editValue, setEditValue] = useState('');

  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [isUpdatingPhone, setIsUpdatingPhone] = useState(false);

  const [showCarTypeModal, setShowCarTypeModal] = useState(false);
  const [showCarSeatsModal, setShowCarSeatsModal] = useState(false);
  const [newCarType, setNewCarType] = useState('');
  const [newCarSeats, setNewCarSeats] = useState('');
  const [isUpdatingCar, setIsUpdatingCar] = useState(false);

  const fetchUserData = async (isMounted = true) => {
    if (!user?.id) {
      if (isMounted) {
        setUserData(prev => ({
          ...prev,
          isLoading: false,
          isDriver: false,
          profileImage: user?.imageUrl || null,
          isAdmin: false,
        }));
      }
      return;
    }

    try {
      const userRef = doc(db, 'users', user.id);
      const userDoc = await getDoc(userRef);

      if (!isMounted) return;

      if (userDoc.exists()) {
        const data = userDoc.data() as UserData;
        setUserData({
          isDriver: !!data.driver?.is_active,
          isLoading: false,
          profileImage: data.driver?.profile_image_url || user?.imageUrl || null,
          data,
          isAdmin: data.role === 'admin',
        });
        setEditValues({
          carType: data.driver?.car_type || 'Not specified',
          carSeats: data.driver?.car_seats?.toString() || '0',
          phoneNumber: phoneNumber,
        });
      } else {
        setUserData(prev => ({
          ...prev,
          isDriver: false,
          isLoading: false,
          profileImage: user?.imageUrl || null,
          data: null,
          isAdmin: false,
        }));
        setEditValues({
          carType: 'Not specified',
          carSeats: '0',
          phoneNumber: phoneNumber,
        });
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      if (isMounted) {
        setUserData(prev => ({
          ...prev,
          isDriver: false,
          isLoading: false,
          profileImage: user?.imageUrl || null,
          isAdmin: false,
        }));
      }
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetchUserData(isMounted);

    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.imageUrl]);

  useEffect(() => {
    checkNotificationPermission();
  }, []);

  const checkNotificationPermission = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setNotificationsEnabled(status === 'granted');
    } catch (error) {
      console.log('Error checking notification permission:', error);
    }
  };

  const toggleNotifications = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      
      if (existingStatus === 'granted') {
        // If notifications are already enabled, show turn off confirmation
        Alert.alert(
          language === 'ar' ? 'تعطيل الإشعارات' : 'Disable Notifications',
          language === 'ar' 
            ? 'هل أنت متأكد أنك تريد تعطيل الإشعارات؟' 
            : 'Are you sure you want to disable notifications?',
          [
            {
              text: language === 'ar' ? 'إلغاء' : 'Cancel',
              style: 'cancel',
            },
            {
              text: language === 'ar' ? 'تعطيل' : 'Disable',
              onPress: () => {
                setNotificationsEnabled(false);
                // Open app settings to let user disable notifications
                Linking.openSettings();
              },
              style: 'destructive',
            },
          ]
        );
      } else {
        // If notifications are disabled, show enable prompt
        Alert.alert(
          language === 'ar' ? 'تفعيل الإشعارات' : 'Enable Notifications',
          language === 'ar' 
            ? 'هل تريد تلقي إشعارات لتتبع رحلاتك وتحديثاتها؟' 
            : 'Would you like to receive notifications to track your rides and updates?',
          [
            {
              text: language === 'ar' ? 'لا تسمح' : "Don't Allow",
              style: 'cancel',
            },
            {
              text: language === 'ar' ? 'السماح' : 'Allow',
              onPress: async () => {
                const { status } = await Notifications.requestPermissionsAsync();
                if (status === 'granted') {
                  setNotificationsEnabled(true);
                  // Register for push notifications here
                  const token = await Notifications.getExpoPushTokenAsync({
                    projectId: 'your-project-id' // Replace with your Expo project ID
                  });
                  console.log('Expo push token:', token);
                  // Here you would typically send this token to your backend
                } else {
                  setNotificationsEnabled(false);
                }
              },
            },
          ]
        );
      }
    } catch (error) {
      console.log('Error toggling notifications:', error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' 
          ? 'حدث خطأ أثناء تحديث إعدادات الإشعارات' 
          : 'There was an error updating notification settings'
      );
    }
  };

  // Update handleEditField to use modal
  const handleEditField = (field: string) => {
    setEditingField(field);
    setEditValue(editValues[field as keyof typeof editValues] || '');
    setEditModalVisible(true);
  };

  // Update handleSaveEdit function
  const handleSaveEdit = async () => {
    if (!user?.id) return;

    try {
      const userRef = doc(db, 'users', user.id);
      const field = editingField;

      if (field === 'carType') {
        if (!editValue.trim()) {
          Alert.alert(
            language === 'ar' ? 'خطأ' : 'Error',
            language === 'ar' ? 'يرجى إدخال نوع السيارة' : 'Please enter car type'
          );
          return;
        }
        await updateDoc(userRef, { 'driver.car_type': editValue.trim() });
        setEditValues(prev => ({ ...prev, carType: editValue.trim() }));
        setUserData(prev => {
          if (!prev.data?.driver) return prev;
          return {
            ...prev,
            data: {
              ...prev.data,
              driver: {
                ...prev.data.driver,
                car_type: editValue.trim(),
              }
            }
          };
        });
      } else if (field === 'carSeats') {
        const seats = parseInt(editValue, 10);
        if (isNaN(seats) || seats < 1 || seats > 10) {
          Alert.alert(
            language === 'ar' ? 'خطأ' : 'Error',
            language === 'ar' ? 'يرجى إدخال عدد مقاعد صالح (1-10)' : 'Please enter a valid number of seats (1-10)'
          );
          return;
        }
        await updateDoc(userRef, { 'driver.car_seats': seats });
        setEditValues(prev => ({ ...prev, carSeats: seats.toString() }));
        setUserData(prev => {
          if (!prev.data?.driver) return prev;
          return {
            ...prev,
            data: {
              ...prev.data,
              driver: {
                ...prev.data.driver,
                car_seats: seats,
              }
            }
          };
        });
      } else if (field === 'phoneNumber') {
        // Basic phone number validation
        const phoneRegex = /^\+?[0-9]{10,15}$/;
        if (!phoneRegex.test(editValue.trim())) {
          Alert.alert(
            language === 'ar' ? 'خطأ' : 'Error',
            language === 'ar' ? 'يرجى إدخال رقم هاتف صالح' : 'Please enter a valid phone number'
          );
          return;
        }

        try {
          // Update in Firestore first
          await updateDoc(userRef, { phone: editValue.trim() });
          
          // Then update in Clerk
          await user?.update({
            unsafeMetadata: {
              ...user.unsafeMetadata,
              phoneNumber: editValue.trim()
            }
          });

          // Update local state
          setEditValues(prev => ({ ...prev, phoneNumber: editValue.trim() }));
          
          // Show success message
          Alert.alert(
            language === 'ar' ? 'نجاح' : 'Success',
            language === 'ar' ? 'تم تحديث رقم الهاتف بنجاح' : 'Phone number updated successfully'
          );
          
          // Trigger haptic feedback
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          
          // Close modal and reset state
          setEditModalVisible(false);
          setEditingField(null);
          
          return; // Exit early since we've handled the success case
        } catch (error) {
          console.error('Error updating phone number:', error);
          throw new Error('Failed to update phone number');
        }
      }

      // Show success message for other fields
      Alert.alert(
        language === 'ar' ? 'نجاح' : 'Success',
        language === 'ar' ? 'تم تحديث المعلومات بنجاح' : 'Information updated successfully'
      );
      
      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Close modal and reset state
      setEditModalVisible(false);
      setEditingField(null);
    } catch (error) {
      console.error(`Error updating ${editingField}:`, error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'حدث خطأ أثناء تحديث المعلومات' : 'Error updating information'
      );
      // Trigger error haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleImagePick = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          language === 'ar' ? 'تم رفض الإذن' : 'Permission Denied',
          language === 'ar' ? 'يجب منح إذن للوصول إلى مكتبة الصور' : 'You need to grant permission to access media library.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset?.uri) return;

      // Validate file type
      const fileExtension = asset.uri.split('.').pop()?.toLowerCase();
      if (!['jpg', 'jpeg', 'png'].includes(fileExtension || '')) {
        Alert.alert(
          language === 'ar' ? 'خطأ' : 'Error',
          language === 'ar' ? 'يجب اختيار صورة بصيغة JPG أو PNG' : 'Please select a JPG or PNG image.'
        );
        return;
      }

      // Show temporary local image while uploading
      setUserData(prev => ({ ...prev, profileImage: asset.uri }));
        setIsUploading(true);

      // Upload to Cloudinary first
      const uploadedImageUrl = await uploadImageToCloudinary(asset.uri);

      if (!uploadedImageUrl) {
        throw new Error(language === 'ar' ? 'فشل في تحميل الصورة' : 'Failed to upload image');
      }

      // Update both Firebase and Clerk
      if (user?.id) {
        // Update Clerk profile image
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const file = new File([blob], `profile.${fileExtension}`, { type: `image/${fileExtension}` });
        
        await user.setProfileImage({
          file: file
        });

        // Update Firestore document
        const userRef = doc(db, 'users', user.id);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data() as UserData;
          // Update both driver and user profile image URLs
          const updateData: any = {
            profile_image_url: uploadedImageUrl
          };
          
          // If user is a driver, also update the driver profile image
          if (userData.driver?.is_active) {
            updateData['driver.profile_image_url'] = uploadedImageUrl;
          }
          
          await updateDoc(userRef, updateData);
        } else {
          // Create a new user document with profile image
          await setDoc(userRef, {
            userId: user.id,
            email: user.primaryEmailAddress?.emailAddress,
            firstName: user.firstName,
            lastName: user.lastName,
            createdAt: new Date().toISOString(),
            profile_image_url: uploadedImageUrl
          });
        }

        // Update profile image state with the Cloudinary URL
        setUserData(prev => ({ ...prev, profileImage: uploadedImageUrl }));
        
        // Refresh the profile image in the context
        await refreshProfileImage();
        
        Alert.alert(
          language === 'ar' ? 'نجاح' : 'Success',
          language === 'ar' ? 'تم تحديث صورة البروفايل بنجاح' : 'Profile picture updated successfully'
        );

        // Trigger haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Profile image upload error:', error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'حدث خطأ أثناء تحديث صورة البروفايل' : 'Error updating profile picture'
      );
      // Revert to previous image if available
      setUserData(prev => ({ ...prev, profileImage: user?.imageUrl || null }));
    } finally {
      setIsUploading(false);
    }
  };

  const handleCarImagePick = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          language === 'ar' ? 'تم رفض الإذن' : 'Permission Denied',
          language === 'ar' ? 'يجب منح إذن للوصول إلى مكتبة الصور' : 'You need to grant permission to access media library.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset?.uri) return;

      // Validate file type
      const fileExtension = asset.uri.split('.').pop()?.toLowerCase();
      if (!['jpg', 'jpeg', 'png'].includes(fileExtension || '')) {
        Alert.alert(
          language === 'ar' ? 'خطأ' : 'Error',
          language === 'ar' ? 'يجب اختيار صورة بصيغة JPG أو PNG' : 'Please select a JPG or PNG image.'
        );
        return;
      }

        setIsUploading(true);

      // Upload to Cloudinary
      const uploadedImageUrl = await uploadImageToCloudinary(asset.uri);

      if (!uploadedImageUrl) {
        throw new Error(language === 'ar' ? 'فشل في تحميل صورة السيارة' : 'Failed to upload car image');
      }

      // Update Firestore document
      if (user?.id) {
        const userRef = doc(db, 'users', user.id);
        await updateDoc(userRef, {
          'driver.car_image_url': uploadedImageUrl
        });

        setUserData(prev => {
          if (!prev.data) return prev;
          return {
            ...prev,
            data: {
              ...prev.data,
              driver: {
                ...prev.data.driver,
                car_image_url: uploadedImageUrl,
                is_active: prev.data.driver?.is_active || false,
                car_type: prev.data.driver?.car_type || '',
                car_seats: prev.data.driver?.car_seats || 0,
                profile_image_url: prev.data.driver?.profile_image_url || '',
                created_at: prev.data.driver?.created_at || new Date().toISOString()
              }
            }
          };
        });

        Alert.alert(
          language === 'ar' ? 'نجاح' : 'Success',
          language === 'ar' ? 'تم تحديث صورة السيارة بنجاح' : 'Car image updated successfully'
        );

        // Trigger haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Car image upload error:', error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'حدث خطأ أثناء تحديث صورة السيارة' : 'Error updating car image'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'يرجى ملء جميع الحقول' : 'Please fill in all fields'
      );
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'كلمات المرور الجديدة غير متطابقة' : 'New passwords do not match'
      );
      return;
    }

    if (passwordData.newPassword.length < 8) {
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'يجب أن تكون كلمة المرور الجديدة 8 أحرف على الأقل' : 'New password must be at least 8 characters'
      );
      return;
    }

    try {
      setIsChangingPassword(true);
      await user?.updatePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });

      // Clear password fields
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setShowChangePassword(false);

      // Show success message
      Alert.alert(
        language === 'ar' ? 'نجاح' : 'Success',
        language === 'ar' ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed successfully'
      );

      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      console.error('Error changing password:', error);
      let errorMessage = language === 'ar' ? 'حدث خطأ أثناء تغيير كلمة المرور' : 'Error changing password';
      
      if (error.errors?.[0]?.message === 'Current password is incorrect') {
        errorMessage = language === 'ar' ? 'كلمة المرور الحالية غير صحيحة' : 'Current password is incorrect';
      }
      
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        errorMessage
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Update handlePhoneNumberUpdate function
  const handlePhoneNumberUpdate = async () => {
    if (!user?.id) return;

    // Format phone number with +972 prefix
    const formattedNumber = '+972' + newPhoneNumber.trim();

    // Validate phone number format
    const phoneRegex = /^\+972[0-9]{9}$/;
    if (!phoneRegex.test(formattedNumber)) {
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' 
          ? 'يرجى إدخال رقم هاتف صالح (9 أرقام بعد +972)' 
          : 'Please enter a valid phone number (9 digits after +972)'
      );
      return;
    }

    try {
      setIsUpdatingPhone(true);
      const userRef = doc(db, 'users', user.id);

      // Update in Firestore first using 'phone' instead of 'phoneNumber'
      await updateDoc(userRef, { phone: formattedNumber });
      
      // Then update in Clerk
      await user?.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          phoneNumber: formattedNumber
        }
      });

      // Update local state
      setEditValues(prev => ({ ...prev, phoneNumber: formattedNumber }));
      
      // Show success message
      Alert.alert(
        language === 'ar' ? 'نجاح' : 'Success',
        language === 'ar' ? 'تم تحديث رقم الهاتف بنجاح' : 'Phone number updated successfully'
      );
      
      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Close modal and reset state
      setShowPhoneModal(false);
      setNewPhoneNumber('');
    } catch (error) {
      console.error('Error updating phone number:', error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'حدث خطأ أثناء تحديث رقم الهاتف' : 'Error updating phone number'
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsUpdatingPhone(false);
    }
  };

  // Add new function to handle car type update
  const handleCarTypeUpdate = async () => {
    if (!user?.id) return;

    if (!newCarType.trim()) {
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'يرجى إدخال نوع السيارة' : 'Please enter car type'
      );
      return;
    }

    try {
      setIsUpdatingCar(true);
      const userRef = doc(db, 'users', user.id);

      // Update in Firestore
      await updateDoc(userRef, { 'driver.car_type': newCarType.trim() });
      
      // Update local state
      setEditValues(prev => ({ ...prev, carType: newCarType.trim() }));
      setUserData(prev => {
        if (!prev.data?.driver) return prev;
        return {
          ...prev,
          data: {
            ...prev.data,
            driver: {
              ...prev.data.driver,
              car_type: newCarType.trim(),
            }
          }
        };
      });
      
      // Show success message
      Alert.alert(
        language === 'ar' ? 'نجاح' : 'Success',
        language === 'ar' ? 'تم تحديث نوع السيارة بنجاح' : 'Car type updated successfully'
      );
      
      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Close modal and reset state
      setShowCarTypeModal(false);
      setNewCarType('');
    } catch (error) {
      console.error('Error updating car type:', error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'حدث خطأ أثناء تحديث نوع السيارة' : 'Error updating car type'
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsUpdatingCar(false);
    }
  };

  // Add new function to handle car seats update
  const handleCarSeatsUpdate = async () => {
    if (!user?.id) return;

    const seats = parseInt(newCarSeats, 10);
    if (isNaN(seats) || seats < 1 || seats > 10) {
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'يرجى إدخال عدد مقاعد صالح (1-10)' : 'Please enter a valid number of seats (1-10)'
      );
      return;
    }

    try {
      setIsUpdatingCar(true);
      const userRef = doc(db, 'users', user.id);

      // Update in Firestore
      await updateDoc(userRef, { 'driver.car_seats': seats });
      
      // Update local state
      setEditValues(prev => ({ ...prev, carSeats: seats.toString() }));
      setUserData(prev => {
        if (!prev.data?.driver) return prev;
        return {
          ...prev,
          data: {
            ...prev.data,
            driver: {
              ...prev.data.driver,
              car_seats: seats,
            }
          }
        };
      });
      
      // Show success message
      Alert.alert(
        language === 'ar' ? 'نجاح' : 'Success',
        language === 'ar' ? 'تم تحديث عدد المقاعد بنجاح' : 'Car seats updated successfully'
      );
      
      // Trigger haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Close modal and reset state
      setShowCarSeatsModal(false);
      setNewCarSeats('');
    } catch (error) {
      console.error('Error updating car seats:', error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'حدث خطأ أثناء تحديث عدد المقاعد' : 'Error updating car seats'
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsUpdatingCar(false);
    }
  };

  return (
    <>
      <Stack.Screen 
        options={{
          headerTitle: language === 'ar' ? 'تعديل الملف' : 'Profile Edit',
          headerTitleStyle: {
            fontSize: 18,
            fontFamily: language === 'ar' ? 'Cairo-Bold' : 'PlusJakartaSans-Bold',
          },
          headerTitleAlign: 'center',
        }} 
      />
      <SafeAreaView className="flex-1 bg-white">
        <ScrollView
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                fetchUserData().finally(() => setIsRefreshing(false));
              }}
              colors={["#F97316"]}
              tintColor="#F97316"
            />
          }
          className="flex-1"
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Images */}
          <View className={`${userData.isDriver ? 'flex-row justify-between' : 'items-center'}`}>
            <View className={`${userData.isDriver ? 'w-[48%]' : 'w-[40%]'}`}>
              <TouchableOpacity 
                onPress={() => setShowFullImage(true)} 
                className="bg-white rounded-2xl overflow-hidden"
              >
                <Image
                  source={{ uri: userData.profileImage || user?.imageUrl }}
                  className="w-full aspect-square"
                  resizeMode="cover"
                />
                <TouchableOpacity
                  onPress={handleImagePick}
                  className="absolute bottom-2 right-2 bg-orange-500 rounded-full p-2"
                >
                  <MaterialCommunityIcons name="camera" size={20} color="white" />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            {userData.isDriver && (
              <View className="w-[48%]">
                <TouchableOpacity 
                  onPress={() => setShowFullCarImage(true)} 
                  className="bg-white rounded-2xl overflow-hidden"
                >
                  <Image
                    source={{ uri: userData.data?.driver?.car_image_url }}
                    className="w-full aspect-square"
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    onPress={handleCarImagePick}
                    className="absolute bottom-2 right-2 bg-orange-500 rounded-full p-2"
                  >
                    <MaterialCommunityIcons name="camera" size={20} color="white" />
                  </TouchableOpacity>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Form Fields */}
          <View className="mt-8 space-y-6">
            {/* Full Name */}
            <View>
              <Text className={`text-gray-500 text-[13px] mb-1 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'الاسم الكامل' : 'Full Name'}
              </Text>
              <View className="bg-white py-3 px-3 border border-gray-200 rounded-md">
                <Text className={`text-[15px] text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {user?.fullName || (language === 'ar' ? 'غير محدد' : 'Not specified')}
                </Text>
              </View>
            </View>

            {/* Email */}
            <View>
              <Text className={`text-gray-500 text-[13px] mb-1 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}
              </Text>
              <View className="bg-white py-3 px-3 border border-gray-200 rounded-md">
                <Text className={`text-[15px] text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {user?.primaryEmailAddress?.emailAddress || (language === 'ar' ? 'غير محدد' : 'Not specified')}
                </Text>
              </View>
            </View>

            {/* Driver Information Section */}
            {userData.isDriver ? (
              <>
                {/* Car Type */}
                <View>
                  <Text className={`text-gray-500 text-[13px] mb-1 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {language === 'ar' ? 'نوع السيارة' : 'Car Type'}
                  </Text>
                  <View className={`bg-white py-3 px-3 border border-gray-200 rounded-md flex-row justify-between items-center ${language === 'ar' ? 'flex-row-reverse' : ''}`}>
                    <Text className={`text-[15px] text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                      {userData.data?.driver?.car_type || (language === 'ar' ? 'غير محدد' : 'Not specified')}
                    </Text>
                    <TouchableOpacity onPress={() => setShowCarTypeModal(true)}>
                      <MaterialIcons name="edit" size={20} color="#F97316" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Car Seats */}
                <View>
                  <Text className={`text-gray-500 text-[13px] mb-1 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                    {language === 'ar' ? 'عدد المقاعد' : 'Car Seats'}
                  </Text>
                  <View className={`bg-white py-3 px-3 border border-gray-200 rounded-md flex-row justify-between items-center ${language === 'ar' ? 'flex-row-reverse' : ''}`}>
                    <Text className={`text-[15px] text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                      {userData.data?.driver?.car_seats || '0'}
                    </Text>
                    <TouchableOpacity onPress={() => setShowCarSeatsModal(true)}>
                      <MaterialIcons name="edit" size={20} color="#F97316" />
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            ) : (
              <TouchableOpacity
                onPress={() => router.push('/(root)/driverInfo')}
                className="bg-orange-50 rounded-xl p-4"
              >
                <View className={`flex-row items-center justify-between ${language === 'ar' ? 'flex-row-reverse' : ''}`}>
                  <View className={`flex-1 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
                    <Text className={`text-lg ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-orange-500`}>
                      {language === 'ar' ? 'كن سائقاً' : 'Become a Driver'}
                    </Text>
                    <Text className={`text-sm text-gray-500 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                      {language === 'ar' ? 'اكسب المال من خلال تقديم الرحلات' : 'Earn money by giving rides'}
                    </Text>
                  </View>
                  <MaterialIcons name="arrow-forward-ios" size={20} color="#F97316" />
                </View>
              </TouchableOpacity>
            )}

            {/* Phone Number */}
            <View>
              <Text className={`text-gray-500 text-[13px] mb-1 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
              </Text>
              <View className={`bg-white py-3 px-3 border border-gray-200 rounded-md flex-row justify-between items-center ${language === 'ar' ? 'flex-row-reverse' : ''}`}>
                <Text className={`text-[15px] text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {phoneNumber}
                </Text>
                <TouchableOpacity onPress={() => setShowPhoneModal(true)}>
                  <MaterialIcons name="edit" size={20} color="#F97316" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Change Password Button */}
            <TouchableOpacity
              onPress={() => setShowChangePassword(true)}
              className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : ''}`}
            >
              <View className={`w-9 h-9 rounded-full bg-orange-500 items-center justify-center ${language === 'ar' ? 'ml-3.5' : 'mr-3.5'}`}>
                <MaterialIcons name="lock" size={22} color="#fff" />
              </View>
              <Text className={`text-base font-bold text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'تغيير كلمة المرور' : 'Change Password'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Edit Modal */}
        <Modal
          visible={editModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <View className="flex-1 bg-black/50 justify-center items-center p-4">
            <View className="bg-white rounded-2xl w-full max-w-sm p-6">
              <Text className={`text-lg font-bold mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {editingField === 'carType' 
                  ? (language === 'ar' ? 'تعديل نوع السيارة' : 'Edit Car Type')
                  : editingField === 'carSeats'
                  ? (language === 'ar' ? 'تعديل عدد المقاعد' : 'Edit Car Seats')
                  : (language === 'ar' ? 'تعديل رقم الهاتف' : 'Edit Phone Number')}
              </Text>
              <TextInput
                value={editValue}
                onChangeText={setEditValue}
                className={`bg-gray-50 rounded-xl p-4 mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}
                placeholder={
                  editingField === 'carType'
                    ? (language === 'ar' ? 'أدخل نوع السيارة' : 'Enter car type')
                    : editingField === 'carSeats'
                    ? (language === 'ar' ? 'أدخل عدد المقاعد (1-10)' : 'Enter number of seats (1-10)')
                    : (language === 'ar' ? 'أدخل رقم الهاتف' : 'Enter phone number')
                }
                keyboardType={editingField === 'carSeats' ? 'number-pad' : 'phone-pad'}
                maxLength={editingField === 'carSeats' ? 2 : 15}
                autoFocus
              />
              <View className="flex-row justify-end space-x-2">
                <TouchableOpacity
                  onPress={() => {
                    setEditModalVisible(false);
                    setEditingField(null);
                  }}
                  className="px-4 py-2 rounded-lg"
                >
                  <Text className="text-gray-600">
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveEdit}
                  className="bg-orange-500 px-4 py-2 rounded-lg"
                >
                  <Text className="text-white">
                    {language === 'ar' ? 'حفظ' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Change Password Modal */}
        <Modal
          visible={showChangePassword}
          transparent
          animationType="fade"
          onRequestClose={() => setShowChangePassword(false)}
        >
          <View className="flex-1 bg-black/50 justify-center items-center p-4">
            <View className="bg-white rounded-2xl w-full max-w-sm p-6">
              <Text className={`text-lg font-bold mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'تغيير كلمة المرور' : 'Change Password'}
              </Text>
              <TextInput
                value={passwordData.currentPassword}
                onChangeText={(text) => setPasswordData(prev => ({ ...prev, currentPassword: text }))}
                className={`bg-gray-50 rounded-xl p-4 mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}
                placeholder={language === 'ar' ? 'كلمة المرور الحالية' : 'Current Password'}
                secureTextEntry
              />
              <TextInput
                value={passwordData.newPassword}
                onChangeText={(text) => setPasswordData(prev => ({ ...prev, newPassword: text }))}
                className={`bg-gray-50 rounded-xl p-4 mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}
                placeholder={language === 'ar' ? 'كلمة المرور الجديدة' : 'New Password'}
                secureTextEntry
              />
              <TextInput
                value={passwordData.confirmPassword}
                onChangeText={(text) => setPasswordData(prev => ({ ...prev, confirmPassword: text }))}
                className={`bg-gray-50 rounded-xl p-4 mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}
                placeholder={language === 'ar' ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
                secureTextEntry
              />
              <View className="flex-row justify-end space-x-2">
                <TouchableOpacity
                  onPress={() => setShowChangePassword(false)}
                  className="px-4 py-2 rounded-lg"
                >
                  <Text className="text-gray-600">
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleChangePassword}
                  disabled={isChangingPassword}
                  className="bg-orange-500 px-4 py-2 rounded-lg"
                >
                  {isChangingPassword ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white">
                      {language === 'ar' ? 'حفظ' : 'Save'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Phone Number Modal */}
        <Modal
          visible={showPhoneModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPhoneModal(false)}
        >
          <View className="flex-1 bg-black/50 justify-center items-center p-4">
            <View className="bg-white rounded-2xl w-full max-w-sm p-6">
              <Text className={`text-lg font-bold mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'تحديث رقم الهاتف' : 'Update Phone Number'}
              </Text>
              
              <View className="mb-4">
                <Text className={`text-sm text-gray-500 mb-2 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'الرقم الحالي' : 'Current Number'}
                </Text>
                <Text className={`text-base text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {phoneNumber}
                </Text>
              </View>

              <View className="mb-4">
                <Text className={`text-sm text-gray-500 mb-2 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'رقم الهاتف الجديد' : 'New Phone Number'}
                </Text>
                <View className={`flex-row items-center bg-gray-50 rounded-xl overflow-hidden ${language === 'ar' ? 'flex-row-reverse' : ''}`}>
                  <View className="bg-gray-200 px-4 py-4">
                    <Text className="text-gray-700 font-medium">+972</Text>
                  </View>
                  <TextInput
                    value={newPhoneNumber}
                    onChangeText={(text) => {
                      // Only allow digits
                      const cleaned = text.replace(/[^\d]/g, '');
                      // Limit to 9 digits
                      setNewPhoneNumber(cleaned.slice(0, 9));
                    }}
                    className={`flex-1 p-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}
                    placeholder={language === 'ar' ? 'أدخل الرقم' : 'Enter number'}
                    keyboardType="number-pad"
                    maxLength={9}
                    autoFocus
                  />
                </View>
                <Text className={`text-xs text-gray-500 mt-2 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' 
                    ? 'أدخل 9 أرقام بعد +972' 
                    : 'Enter 9 digits after +972'}
                </Text>
              </View>

              <View className="flex-row justify-end space-x-2">
                <TouchableOpacity
                  onPress={() => {
                    setShowPhoneModal(false);
                    setNewPhoneNumber('');
                  }}
                  className="px-4 py-2 rounded-lg"
                >
                  <Text className="text-gray-600">
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handlePhoneNumberUpdate}
                  disabled={isUpdatingPhone || newPhoneNumber.length !== 9}
                  className={`px-4 py-2 rounded-lg ${newPhoneNumber.length === 9 ? 'bg-orange-500' : 'bg-gray-300'}`}
                >
                  {isUpdatingPhone ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white">
                      {language === 'ar' ? 'حفظ' : 'Save'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Car Type Modal */}
        <Modal
          visible={showCarTypeModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCarTypeModal(false)}
        >
          <View className="flex-1 bg-black/50 justify-center items-center p-4">
            <View className="bg-white rounded-2xl w-full max-w-sm p-6">
              <Text className={`text-lg font-bold mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'تحديث نوع السيارة' : 'Update Car Type'}
              </Text>
              
              <View className="mb-4">
                <Text className={`text-sm text-gray-500 mb-2 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'النوع الحالي' : 'Current Type'}
                </Text>
                <Text className={`text-base text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {userData.data?.driver?.car_type || (language === 'ar' ? 'غير محدد' : 'Not specified')}
                </Text>
              </View>

              <TextInput
                value={newCarType}
                onChangeText={setNewCarType}
                className={`bg-gray-50 rounded-xl p-4 mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}
                placeholder={language === 'ar' ? 'أدخل نوع السيارة الجديد' : 'Enter new car type'}
                autoFocus
              />

              <View className="flex-row justify-end space-x-2">
                <TouchableOpacity
                  onPress={() => {
                    setShowCarTypeModal(false);
                    setNewCarType('');
                  }}
                  className="px-4 py-2 rounded-lg"
                >
                  <Text className="text-gray-600">
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCarTypeUpdate}
                  disabled={isUpdatingCar}
                  className="bg-orange-500 px-4 py-2 rounded-lg"
                >
                  {isUpdatingCar ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white">
                      {language === 'ar' ? 'حفظ' : 'Save'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Car Seats Modal */}
        <Modal
          visible={showCarSeatsModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCarSeatsModal(false)}
        >
          <View className="flex-1 bg-black/50 justify-center items-center p-4">
            <View className="bg-white rounded-2xl w-full max-w-sm p-6">
              <Text className={`text-lg font-bold mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' ? 'تحديث عدد المقاعد' : 'Update Car Seats'}
              </Text>
              
              <View className="mb-4">
                <Text className={`text-sm text-gray-500 mb-2 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {language === 'ar' ? 'العدد الحالي' : 'Current Seats'}
                </Text>
                <Text className={`text-base text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                  {userData.data?.driver?.car_seats || '0'}
                </Text>
              </View>

              <TextInput
                value={newCarSeats}
                onChangeText={setNewCarSeats}
                className={`bg-gray-50 rounded-xl p-4 mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}
                placeholder={language === 'ar' ? 'أدخل عدد المقاعد الجديد' : 'Enter new number of seats'}
                keyboardType="number-pad"
                maxLength={2}
                autoFocus
              />

              <Text className={`text-xs text-gray-500 mb-4 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
                {language === 'ar' 
                  ? 'يجب أن يكون العدد بين 1 و 10' 
                  : 'Number must be between 1 and 10'}
              </Text>

              <View className="flex-row justify-end space-x-2">
                <TouchableOpacity
                  onPress={() => {
                    setShowCarSeatsModal(false);
                    setNewCarSeats('');
                  }}
                  className="px-4 py-2 rounded-lg"
                >
                  <Text className="text-gray-600">
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCarSeatsUpdate}
                  disabled={isUpdatingCar}
                  className="bg-orange-500 px-4 py-2 rounded-lg"
                >
                  {isUpdatingCar ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white">
                      {language === 'ar' ? 'حفظ' : 'Save'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
};

export default ProfileEdit;