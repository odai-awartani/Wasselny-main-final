import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { useUser } from '@clerk/clerk-expo';
import { router } from 'expo-router';
import { MaterialCommunityIcons, Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { useLanguage } from '@/context/LanguageContext';
import Header from '@/components/Header';

interface DashboardStats {
  totalDrivers: number;
  activeDrivers: number;
  pendingApplications: number;
  totalRides: number;
  totalUsers: number;
  pendingSupport: number;
}

type IconName = 'account-group' | 'car' | 'clock-outline' | 'map-marker-path' | 'account-cog' | 'chart-bar' | 'message-text' | 'help-circle';

const SkeletonStatCard = () => (
  <View className="bg-white rounded-xl p-4 mb-4 shadow-sm">
    <View className="flex-row items-center justify-between">
      <View>
        <View className="h-8 w-20 bg-gray-200 rounded-lg mb-2" />
        <View className="h-4 w-24 bg-gray-200 rounded" />
      </View>
      <View className="bg-gray-200 p-3 rounded-full">
        <View className="w-6 h-6 rounded-full bg-gray-300" />
      </View>
    </View>
  </View>
);

const SkeletonQuickActionCard = () => (
  <View className="bg-white rounded-xl p-4 mb-4 shadow-sm">
    <View className="flex-row items-center">
      <View className="bg-gray-200 p-3 rounded-full mr-4">
        <View className="w-6 h-6 rounded-full bg-gray-300" />
      </View>
      <View className="flex-1">
        <View className="h-6 w-32 bg-gray-200 rounded mb-2" />
        <View className="h-4 w-48 bg-gray-200 rounded" />
      </View>
      <View className="w-6 h-6 bg-gray-200 rounded-full" />
    </View>
  </View>
);

const AdminDashboard = () => {
  const { user } = useUser();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalDrivers: 0,
    activeDrivers: 0,
    pendingApplications: 0,
    totalRides: 0,
    totalUsers: 0,
    pendingSupport: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Set up real-time listeners for different collections
        const usersUnsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
          const users = snapshot.docs;
          const totalUsers = users.length;
          const drivers = users.filter(doc => doc.data().driver);
          const activeDrivers = drivers.filter(doc => doc.data().driver?.is_active).length;
          const pendingApplications = drivers.filter(doc => doc.data().driver?.status === 'pending').length;

          setStats(prev => ({
            ...prev,
            totalUsers,
            totalDrivers: drivers.length,
            activeDrivers,
            pendingApplications
          }));
        });

        const ridesUnsubscribe = onSnapshot(collection(db, 'rides'), (snapshot) => {
          setStats(prev => ({
            ...prev,
            totalRides: snapshot.size
          }));
        });

        // Add support messages listener
        const supportUnsubscribe = onSnapshot(
          query(collection(db, 'support_messages'), where('status', '==', 'pending')),
          (snapshot) => {
            setStats(prev => ({
              ...prev,
              pendingSupport: snapshot.size
            }));
          }
        );

        setLoading(false);

        return () => {
          usersUnsubscribe();
          ridesUnsubscribe();
          supportUnsubscribe();
        };
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const StatCard = ({ title, value, icon, color }: { title: string; value: number; icon: IconName; color: string }) => (
    <View className="bg-white rounded-xl p-4 mb-4 shadow-sm">
      <View className={`flex-row items-center justify-between ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
        <View className={`flex-1 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
          <Text className={`text-2xl font-bold text-${color}-600 ${language === 'ar' ? 'text-right' : 'text-left'}`}>{value}</Text>
          <Text className={`text-gray-600 text-sm mt-1 ${language === 'ar' ? 'text-right' : 'text-left'}`}>{title}</Text>
        </View>
        <View className={`bg-${color}-100 p-3 rounded-full ${language === 'ar' ? 'ml-4' : 'mr-4'}`}>
          <MaterialCommunityIcons name={icon} size={24} color={`#${color === 'blue' ? '3B82F6' : color === 'green' ? '22C55E' : color === 'orange' ? 'F97316' : '8B5CF6'}`} />
        </View>
      </View>
    </View>
  );

  const QuickActionCard = ({ title, description, icon, onPress, color, badge }: { 
    title: string; 
    description: string; 
    icon: IconName; 
    onPress: () => void;
    color: string;
    badge?: number;
  }) => (
    <TouchableOpacity 
      onPress={onPress}
      className="bg-white rounded-xl p-4 mb-4 shadow-sm"
    >
      <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
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
            name={icon} 
            size={24} 
            color="#F97316"
          />
        </View>
        <View className={`flex-1 ${language === 'ar' ? 'items-end' : 'items-start'}`}>
          <View className={`flex-row items-center ${language === 'ar' ? 'flex-row-reverse' : 'flex-row'}`}>
            <Text className={`text-lg font-bold ${language === 'ar' ? 'text-right' : 'text-left'}`}>{title}</Text>
            {badge ? (
              <View className={`bg-red-500 rounded-full px-2 py-0.5 ${language === 'ar' ? 'mr-2' : 'ml-2'}`}>
                <Text className="text-white text-xs font-bold">{badge}</Text>
              </View>
            ) : null}
          </View>
          <Text className={`text-gray-600 text-sm ${language === 'ar' ? 'text-right' : 'text-left'}`}>{description}</Text>
        </View>
        <MaterialCommunityIcons 
          name={language === 'ar' ? "chevron-left" : "chevron-right"} 
          size={24} 
          color="#6B7280" 
        />
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <Header 
          showProfileImage={false} 
          showSideMenu={false} 
          title={language === 'ar' ? 'لوحة التحكم' : 'Admin Dashboard'} 
        />
        <ScrollView className="flex-1 px-4">
          <View className="py-4">
            {/* Stats Section Skeleton */}
            <View className="mb-6">
              <View className="h-6 w-24 bg-gray-200 rounded mb-4" />
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
            </View>

            {/* Quick Actions Section Skeleton */}
            <View className="mb-6">
              <View className="h-6 w-24 bg-gray-200 rounded mb-4" />
              <SkeletonQuickActionCard />
              <SkeletonQuickActionCard />
              <SkeletonQuickActionCard />
              <SkeletonQuickActionCard />
              <SkeletonQuickActionCard />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <Header 
        showProfileImage={false} 
        showSideMenu={false} 
        title={language === 'ar' ? 'لوحة التحكم' : 'Admin Dashboard'} 
      />
      
      <ScrollView className="flex-1 px-4">
        <View className="py-6">
          {/* Quick Actions Section */}
          <View>
            <Text className={`text-lg mb-4 ${language === 'ar' ? 'font-CairoBold text-right' : 'font-JakartaBold text-left'}`}>
              {language === 'ar' ? 'مركز الادارة' : 'Quick Actions'}
            </Text>
            <QuickActionCard 
              title={language === 'ar' ? 'رسائل الدعم' : 'Support Messages'} 
              description={language === 'ar' ? 'عرض وإدارة رسائل دعم المستخدمين' : 'View and manage user support messages'}
              icon="message-text"
              color="yellow"
              badge={stats.pendingSupport}
              onPress={() => router.push('/(root)/admin/support-messages' as any)}
            />
            <QuickActionCard 
              title={language === 'ar' ? 'طلبات السائقين' : 'Driver Applications'} 
              description={language === 'ar' ? 'مراجعة وإدارة طلبات السائقين' : 'Review and manage driver applications'}
              icon="car"
              color="red"
              onPress={() => router.push('/(root)/admin/driverApplications' as any)}
            />
            <QuickActionCard 
              title={language === 'ar' ? 'إدارة المستخدمين' : 'User Management'} 
              description={language === 'ar' ? 'إدارة حسابات المستخدمين والصلاحيات' : 'Manage user accounts and permissions'}
              icon="account-cog"
              color="blue"
              onPress={() => router.push('/(root)/admin/users' as any)}
            />
            <QuickActionCard 
              title={language === 'ar' ? 'إدارة الرحلات' : 'Ride Management'} 
              description={language === 'ar' ? 'مراقبة وإدارة الرحلات النشطة' : 'Monitor and manage active rides'}
              icon="map-marker-path"
              color="purple"
              onPress={() => router.push('/(root)/admin/rides' as any)}
            />
            <QuickActionCard 
              title={language === 'ar' ? 'التقارير' : 'Reports'} 
              description={language === 'ar' ? 'عرض تقارير وتحليلات النظام' : 'View system reports and analytics'}
              icon="chart-bar"
              color="green"
              onPress={() => router.push('/(root)/admin/reports' as any)}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default AdminDashboard; 