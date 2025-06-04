import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Image, Alert, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import InputField from '@/components/InputField'; // استيراد InputField
import { useLanguage } from '@/context/LanguageContext';
import CustomButton from '@/components/CustomButton';
import { icons, images } from '@/constants';
import { Link, router } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo'; // استيراد useSignIn من Clerk
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CustomErrorModal from '@/components/CustomErrorModal';

const SignIn = () => {
  const { t, language } = useLanguage();
  const { isLoaded, signIn, setActive } = useSignIn(); // استخدام useSignIn من Clerk
  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const [showCustomErrorModal, setShowCustomErrorModal] = useState(false);
  const [customErrorMessage, setCustomErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const showErrorAlert = (message: string) => {
    setCustomErrorMessage(message);
    setShowCustomErrorModal(true);
  };

  const onSignInPress = async () => {
    if (!isLoaded) return;

    if (!form.email || !form.password) {
      showErrorAlert(t.fillAllFields);
      return;
    }

    try {
      setIsLoading(true);
      const completeSignIn = await signIn.create({
        identifier: form.email,
        password: form.password,
      });

      if (completeSignIn.status === 'complete') {
        await setActive({ session: completeSignIn.createdSessionId });
        router.replace('/home');
      } else {
        // This part might be reached for other statuses, though 'complete' is the main one.
        // We can still show a generic failed message here.
        showErrorAlert(t.signInFailed);
      }
    } catch (err: any) {
      console.error('Error during sign in:', err);
      // Check for specific Clerk error codes or messages
      let errorMessageKey = t.signInFailed; // Default to generic failed message

      if (err.errors && err.errors.length > 0) {
        const clerkErrorCode = err.errors[0].code;

        switch (clerkErrorCode) {
          case 'form_password_incorrect':
            errorMessageKey = t.incorrectPassword;
            break;
          case 'form_identifier_not_found':
            errorMessageKey = t.userNotFound;
            break;
          case 'form_identifier_invalid':
            errorMessageKey = t.identifierInvalid;
            break;
          // Add other specific Clerk error codes as needed
          default:
            // Explicitly check for known English error messages from Clerk
            if (err.errors[0].longMessage === 'Identifier is invalid.') {
              errorMessageKey = t.identifierInvalid;
            } else {
              // Fallback to Clerk's long message or a generic translated message
              errorMessageKey = err.errors[0].longMessage || t.signInFailed;
            }
            break;
        }
      }

      showErrorAlert(errorMessageKey);
    } finally {
      setIsLoading(false);
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
                loading={isLoading}
                disabled={isLoading}
              />

              {/* رابط الانتقال إلى تسجيل الدخول */}
              <Link href="/(auth)/sign-up" className={`text-lg text-center text-general-200 mt-4 ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'}`}>
                <Text>{t.noAccount}</Text>
                <Text className="text-orange-500"> {t.signUpButton}</Text>
              </Link>
            </View>
          </View>
        </View>
        <CustomErrorModal
          visible={showCustomErrorModal}
          message={customErrorMessage}
          onClose={() => setShowCustomErrorModal(false)}
          title={t.error}
          t={t}
        />
        <StatusBar backgroundColor="#fff" style="dark" />
      </ScrollView>
    </>
  );
};

export default SignIn;