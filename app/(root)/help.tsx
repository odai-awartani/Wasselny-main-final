import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useUser } from '@clerk/clerk-expo';
import * as Haptics from 'expo-haptics';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import ReactNativeModal from 'react-native-modal';
import { Animated, Modal } from 'react-native';

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
          style={{
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim
          }}
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

export default function Help() {
  const router = useRouter();
  const { language } = useLanguage();
  const { user } = useUser();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    visible: false,
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'warning' | 'info',
    onConfirm: () => {},
    confirmText: language === 'ar' ? 'حسنا' : 'OK',
    onCancel: undefined,
  });

  const handleSendMessage = async () => {
    if (!message.trim()) {
      setAlertConfig({
        visible: true,
        title: language === 'ar' ? 'تنبيه' : 'Warning',
        message: language === 'ar' ? 'الرجاء إدخال رسالة' : 'Please enter a message',
        type: 'warning',
        onConfirm: () => setAlertConfig({ ...alertConfig, visible: false }),
        confirmText: language === 'ar' ? 'حسنا' : 'OK',
        onCancel: undefined,
      });
      return;
    }

    setIsSending(true);
    try {
      await addDoc(collection(db, 'support_messages'), {
        userId: user?.id,
        userName: user?.fullName,
        userEmail: user?.primaryEmailAddress?.emailAddress,
        message: message.trim(),
        createdAt: serverTimestamp(),
        status: 'pending'
      });

      // Use custom alert for success message
      setAlertConfig({
        visible: true,
        title: language === 'ar' ? 'شكرا لك!' : 'Success',
        message: language === 'ar' ? ' لقد تم إرسال رسالتك بنجاح، سنرد عليك قريبًا.' : 'Your message has been sent successfully',
        type: 'success', // Use the success type
        onConfirm: () => setAlertConfig({ ...alertConfig, visible: false }), // Close alert on confirm
        onCancel: undefined, // No cancel button
        confirmText: language === 'ar' ? 'حسنا' : 'OK', // Set confirm text
      });
      setMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert(
        language === 'ar' ? 'خطأ' : 'Error',
        language === 'ar' ? 'حدث خطأ أثناء إرسال الرسالة' : 'Error sending message'
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Custom Alert */}
      <CustomAlert {...alertConfig} />

      {/* Content */}
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        {/* User Info */}
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
        <View className="mt-4">
          <Text className={`text-gray-500 text-[13px] mb-1 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'البريد الإلكتروني' : 'Email Address'}
          </Text>
          <View className="bg-white py-3 px-3 border border-gray-200 rounded-md">
            <Text className={`text-[15px] text-gray-800 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
              {user?.primaryEmailAddress?.emailAddress || (language === 'ar' ? 'غير محدد' : 'Not specified')}
            </Text>
          </View>
        </View>

        {/* Message Input */}
        <View className="mt-4">
          <Text className={`text-gray-500 text-[13px] mb-1 ${language === 'ar' ? 'text-right' : 'text-left'}`}>
            {language === 'ar' ? 'الرسالة' : 'Message'}
          </Text>
          <View className="bg-white border border-gray-200 rounded-md overflow-hidden">
            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={6}
              placeholder={language === 'ar' ? 'اكتب رسالتك هنا...' : 'Write your message here...'}
              placeholderTextColor="#9CA3AF"
              className={`py-3 px-3 text-[15px] ${language === 'ar' ? 'text-right' : 'text-left'}`}
              style={{
                textAlignVertical: 'top',
                minHeight: 120,
                fontFamily: language === 'ar' ? 'Cairo-Regular' : 'PlusJakartaSans-Regular'
              }}
            />
          </View>
        </View>

        {/* Send Button */}
        <TouchableOpacity
          onPress={handleSendMessage}
          disabled={isSending}
          className={`bg-orange-500 py-3 px-4 rounded-md mt-4 ${isSending ? 'opacity-50' : ''}`}
        >
          <Text className={`text-white text-center text-[15px] ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
            {isSending 
              ? (language === 'ar' ? 'جاري الإرسال...' : 'Sending...')
              : (language === 'ar' ? 'إرسال الرسالة' : 'Send Message')
            }
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
} 