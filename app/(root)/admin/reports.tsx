import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { useUser } from '@clerk/clerk-expo';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '@/context/LanguageContext';
import Header from '@/components/Header';

interface ReportStats {
  totalRides: number;
  averageRating: number;
  activeDrivers: number;
  totalUsers: number;
  ridesByStatus: {
    available: number;
    in_progress: number;
    completed: number;
    cancelled: number;
  };
  ridesByDay: {
    [key: string]: number;
  };
}

const Reports = () => {
  const { user } = useUser();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReportStats>({
    totalRides: 0,
    averageRating: 0,
    activeDrivers: 0,
    totalUsers: 0,
    ridesByStatus: {
      available: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0
    },
    ridesByDay: {}
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Set up real-time listeners for different collections
        const ridesUnsubscribe = onSnapshot(collection(db, 'rides'), (snapshot) => {
          const rides = snapshot.docs;
          const totalRides = rides.length;
          const ridesByStatus = {
            available: 0,
            in_progress: 0,
            completed: 0,
            cancelled: 0
          };
          const ridesByDay: { [key: string]: number } = {};

          rides.forEach(doc => {
            const ride = doc.data();
            const status = ride.status || 'available';
            ridesByStatus[status as keyof typeof ridesByStatus]++;
            
            // Count rides by day
            const date = new Date(ride.createdAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US');
            ridesByDay[date] = (ridesByDay[date] || 0) + 1;
          });

          setStats(prev => ({
            ...prev,
            totalRides,
            ridesByStatus,
            ridesByDay
          }));
        });

        const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
          const users = snapshot.docs;
          const totalUsers = users.length;
          const activeDrivers = users.filter(doc => doc.data().driver?.is_active).length;

          setStats(prev => ({
            ...prev,
            totalUsers,
            activeDrivers
          }));
        });

        setLoading(false);

        return () => {
          ridesUnsubscribe();
          usersUnsubscribe();
        };
      } catch (error) {
        console.error('Error fetching report stats:', error);
        setLoading(false);
      }
    };

    fetchStats();
  }, [language]);

  const StatCard = ({ title, value, icon, color }: { title: string; value: string | number; icon: string; color: string }) => (
    <View className="bg-white rounded-xl p-4 mb-4 shadow-sm">
      <View className={`flex-row items-center justify-between ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
        <View className={`flex-1 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
          <Text className={`text-2xl ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-black`}>{value}</Text>
          <Text className={`text-gray-600 text-sm mt-1 ${language === 'ar' ? 'font-CairoRegular text-right' : 'font-JakartaRegular text-left'}`}>{title}</Text>
        </View>
        <View 
          className={`bg-white p-3 rounded-full border border-gray-100 ${language === 'ar' ? 'ml-4' : 'mr-4'}`}
          style={{
            elevation: Platform.OS === "android" ? 2 : 0,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.08,
            shadowRadius: 1.5,
          }}
        >
          <MaterialCommunityIcons 
            name={icon as any} 
            size={24} 
            color="#F97316"
          />
        </View>
      </View>
    </View>
  );

  const StatusCard = ({ title, value, color }: { title: string; value: number; color: string }) => (
    <View 
      className={`bg-${color}-50 rounded-xl p-4 mb-4 border border-gray-100 items-center`}
      style={{
        elevation: Platform.OS === "android" ? 4 : 0,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      }}
    >
      <Text className={`text-orange-500 ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'} mb-1 text-center`}>{title}</Text>
      <View className="h-px bg-gray-300 w-full my-2" />
      <Text className={`text-${color}-900 text-2xl ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'} text-center`}>{value}</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#F97316" />
        <Text className={`text-gray-600 mt-4 ${language === 'ar' ? 'font-CairoMedium text-right' : 'font-JakartaMedium text-left'}`}>
          {language === 'ar' ? 'جاري تحميل التقارير...' : 'Loading reports...'}
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <Header 
        showProfileImage={false} 
        showSideMenu={false} 
        title={language === 'ar' ? 'التقارير والتحليلات' : 'Reports & Analytics'} 
      />
      
      <ScrollView className="flex-1 px-4">
        <View className="py-4">
          {/* Overview Stats */}
          <View className="mb-6">
            <Text className={`text-lg mb-4 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
              {language === 'ar' ? 'نظرة عامة' : 'Overview'}
            </Text>
            <StatCard 
              title={language === 'ar' ? 'إجمالي الرحلات' : 'Total Rides'} 
              value={stats.totalRides} 
              icon="map-marker-path" 
              color="blue" 
            />
            <StatCard 
              title={language === 'ar' ? 'السائقين النشطين' : 'Active Drivers'} 
              value={stats.activeDrivers} 
              icon="car" 
              color="orange" 
            />
            <StatCard 
              title={language === 'ar' ? 'إجمالي المستخدمين' : 'Total Users'} 
              value={stats.totalUsers} 
              icon="account-group" 
              color="purple" 
            />
          </View>

          {/* Ride Status Distribution */}
          <View className="mb-6">
            <Text className={`text-lg mb-4 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
              {language === 'ar' ? 'حالة الرحلات' : 'Ride Status'}
            </Text>
            <View className={`flex-row flex-wrap -mx-2 ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
              <View className="w-1/2 px-2">
                <StatusCard 
                  title={language === 'ar' ? 'متاح' : 'Available'} 
                  value={stats.ridesByStatus.available} 
                  color="green" 
                />
              </View>
              <View className="w-1/2 px-2">
                <StatusCard 
                  title={language === 'ar' ? 'قيد التنفيذ' : 'In Progress'} 
                  value={stats.ridesByStatus.in_progress} 
                  color="blue" 
                />
              </View>
              <View className="w-1/2 px-2">
                <StatusCard 
                  title={language === 'ar' ? 'مكتملة' : 'Completed'} 
                  value={stats.ridesByStatus.completed} 
                  color="purple" 
                />
              </View>
              <View className="w-1/2 px-2">
                <StatusCard 
                  title={language === 'ar' ? 'ملغاة' : 'Cancelled'} 
                  value={stats.ridesByStatus.cancelled} 
                  color="red" 
                />
              </View>
            </View>
          </View>

          {/* Recent Activity */}
          <View className="mb-6">
            <View 
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 items-center"
              style={{
                elevation: Platform.OS === "android" ? 4 : 0,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 3,
              }}
            >
              <Text className={`text-gray-600 text-center ${language === 'ar' ? 'font-CairoRegular' : 'font-JakartaRegular'}`}>
                {language === 'ar' ? 'إجمالي الرحلات' : 'Total Rides'}
              </Text>
              <View className="h-px bg-gray-300 w-full my-2" />
              <Text className={`text-2xl font-bold text-center ${language === 'ar' ? 'font-CairoBold' : 'font-JakartaBold'} text-black`}>
                {stats.totalRides}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Reports; 