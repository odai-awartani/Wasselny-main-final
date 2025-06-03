import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Image, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InputField from '@/components/InputField'; // استيراد InputField
import { useLanguage } from '@/context/LanguageContext';
import CustomButton from '@/components/CustomButton';
import { icons, images } from '@/constants';
import { Link, router } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo'; // استيراد useSignIn من Clerk
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const SignIn = () => {
  const { t, language } = useLanguage();
  const { isLoaded, signIn, setActive } = useSignIn(); // استخدام useSignIn من Clerk
  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const CustomErrorAlert = ({ visible, message, onClose }: { visible: boolean; message: string; onClose: () => void }) => (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center bg-black/50">
        <View className={`bg-orange-50 rounded-2xl p-5 m-4 w-[90%] max-w-[400px] ${language === 'ar' ? 'items-end' : 'items-start'}`}>
          <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'} mb-2`}>
            <MaterialCommunityIcons name="alert-circle" size={24} color="#F97316" />
            <Text className={`text-orange-600 font-bold mx-2 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
              {t.error}
            </Text>
          </View>
          <Text className={`text-orange-700 mb-4 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>
            {message}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            className="bg-orange-100 px-6 py-2 rounded-full self-end"
          >
            <Text className={`text-white ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
              {t.ok}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const showErrorAlert = (message: string) => {
    setErrorMessage(message);
    setShowError(true);
  };

  const onSignInPress = async () => {
    if (!isLoaded) return;

    if (!form.email || !form.password) {
      showErrorAlert(t.fillAllFields);
      return;
    }

    try {
      // محاولة تسجيل الدخول
      const completeSignIn = await signIn.create({
        identifier: form.email,
        password: form.password,
      });

      if (completeSignIn.status === 'complete') {
        // تم تسجيل الدخول بنجاح
        await setActive({ session: completeSignIn.createdSessionId });
        router.replace('/home'); // الانتقال إلى الصفحة الرئيسية
      } else {
        // في حالة وجود خطأ
        showErrorAlert(t.signInFailed);
      }
    } catch (err: any) {
      console.error('Error during sign in:', err);
      showErrorAlert(err.errors[0].longMessage);
    }
  };

  return (
    <>
      <ScrollView className="flex-1 bg-white">
        <View className="flex-1 bg-white">
          <View className="relative w-full h-[250px]">
            <Image source={images.signUpCar} className="z-0 w-full h-[250px]" />
            <Text className={`text-[25px] text-black ${language === 'ar' ? 'font-CairoExtraBold right-5' : 'font-JakartaSemiBold left-5'} absolute bottom-5`}>
              {t.welcome}
            </Text>
          </View>
          {/* Main Form Container with Subtle Border from CreateRideStepper */}
          <View className="p-6 bg-white rounded-xl border border-gray-100 shadow-sm mx-4 mt-4"
            style={{
              elevation: Platform.OS === "android" ? 6 : 0,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 3,
              overflow: "visible", // Important for shadow on iOS
            }}
          >
            {/* حقل البريد الإلكتروني */}
            <InputField
              label={t.email}
              placeholder="user@example.com"
              value={form.email}
              onChangeText={(text) => setForm({ ...form, email: text })}
              keyboardType="email-address"
              labelStyle={language === 'ar' ? 'text-right font-CairoBold text-orange-500' : 'text-left font-JakartaBold text-orange-500'}
              className={`${language === 'ar' ? 'text-right placeholder:text-right font-CairoBold ' : 'text-left placeholder:text-left'}`}
            />

            {/* حقل كلمة السر */}
            <InputField
              label={t.password}
              placeholder="**********"
              value={form.password}
              onChangeText={(text) => setForm({ ...form, password: text })}
              secureTextEntry
              labelStyle={language === 'ar' ? 'text-right font-CairoBold text-orange-500' : 'text-left font-JakartaBold text-orange-500'}
              className={`${language === 'ar' ? 'text-right placeholder:text-right font-CairoBold ' : 'text-left placeholder:text-left'}`}
            />

            {/* رابط نسيان كلمة السر */}
             <TouchableOpacity onPress={() => router.push('/forgot-password')}>
              <Text className={`text-sm text-orange-500 ${language === 'ar' ? 'text-right font-CairoBold' : 'text-left font-JakartaBold'} mt-2`}>
                {t.forgotPassword}
              </Text>
            </TouchableOpacity> 

            {/* زر تسجيل الدخول */}
            <View className="items-center mt-6">
              <CustomButton
                title={t.logIn}
                onPress={onSignInPress}
                
              />

              {/* رابط الانتقال إلى تسجيل الدخول */}
              <Link href="/(auth)/sign-up" className={`text-lg text-center text-general-200 mt-4 ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                <Text>{t.noAccount}</Text>
                <Text className="text-orange-500"> {t.signUpButton}</Text>
              </Link>
            </View>
          </View>
        </View>
        <StatusBar backgroundColor="#fff" style="dark" />
      </ScrollView>
      <CustomErrorAlert
        visible={showError}
        message={errorMessage}
        onClose={() => setShowError(false)}
      />
    </>
  );
};

export default SignIn;