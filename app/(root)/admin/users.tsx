import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useUser } from '@clerk/clerk-expo';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '@/context/LanguageContext';
import Header from '@/components/Header';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  profile_image_url?: string;
  driver?: {
    status: string;
    is_active: boolean;
  };
  createdAt: string;
}

const SkeletonUserCard = () => (
  <View className="bg-white rounded-xl p-4 mb-4 shadow-sm">
    <View className="flex-row justify-between items-start">
      <View className="flex-row flex-1">
        <View className="mr-4">
          <View className="w-12 h-12 rounded-full bg-gray-200" />
        </View>
        <View className="flex-1">
          <View className="h-6 w-32 bg-gray-200 rounded mb-2" />
          <View className="h-4 w-48 bg-gray-200 rounded mb-2" />
          <View className="flex-row mt-2">
            <View className="h-6 w-20 bg-gray-200 rounded-full mr-2" />
            <View className="h-6 w-16 bg-gray-200 rounded-full" />
          </View>
        </View>
      </View>
      <View className="w-10 h-10 bg-gray-200 rounded-full" />
    </View>
  </View>
);

const UsersManagement = () => {
  const { user } = useUser();
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'drivers' | 'passengers'>('all');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersQuery = query(collection(db, 'users'));
        
        const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
          const usersData = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name || '',
              email: data.email || '',
              profile_image_url: data.profile_image_url || '',
              role: data.role || 'passenger',
              driver: data.driver ? {
                status: data.driver.status || 'pending',
                is_active: data.driver.is_active || false
              } : undefined,
              createdAt: data.createdAt || new Date().toISOString()
            };
          }) as User[];
          
          setUsers(usersData);
          setLoading(false);
        });

        return () => unsubscribe();
      } catch (error) {
        console.error('Error fetching users:', error);
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      (user.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (user.email?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    
    const matchesFilter = 
      filter === 'all' ||
      (filter === 'drivers' && user.driver) ||
      (filter === 'passengers' && !user.driver);

    return matchesSearch && matchesFilter;
  });

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { role: newRole });
      Alert.alert('Success', 'User role updated successfully');
    } catch (error) {
      console.error('Error updating user role:', error);
      Alert.alert('Error', 'Failed to update user role');
    }
  };

  const UserCard = ({ user }: { user: User }) => (
    <View className="bg-white rounded-xl p-4 mb-4 shadow-sm">
      <View className="flex-row justify-between items-start">
        <View className="flex-row flex-1">
          <View className="mr-4">
            {user.profile_image_url ? (
              <Image 
                source={{ uri: user.profile_image_url }}
                className="w-12 h-12 rounded-full"
              />
            ) : (
              <View className="w-12 h-12 rounded-full bg-gray-200 items-center justify-center">
                <MaterialCommunityIcons name="account" size={24} color="#6B7280" />
              </View>
            )}
          </View>
          <View className="flex-1">
            <Text className="text-lg font-bold">
              {user.name || 'Unnamed User'}
            </Text>
            <Text className="text-gray-600">{user.email || 'No email'}</Text>
            <View className="flex-row mt-2">
              <View className={`px-2 py-1 rounded-full mr-2 ${user.role === 'admin' ? 'bg-purple-100' : user.driver ? 'bg-green-100' : 'bg-blue-100'}`}>
                <Text className={`text-sm ${user.role === 'admin' ? 'text-purple-700' : user.driver ? 'text-green-700' : 'text-blue-700'}`}>
                  {user.role === 'admin' ? 'Admin' : user.driver ? 'Driver' : 'Passenger'}
                </Text>
              </View>
              {user.driver && (
                <View className={`px-2 py-1 rounded-full ${user.driver.is_active ? 'bg-green-100' : 'bg-yellow-100'}`}>
                  <Text className={`text-sm ${user.driver.is_active ? 'text-green-700' : 'text-yellow-700'}`}>
                    {user.driver.is_active ? 'Active' : 'Inactive'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
        <TouchableOpacity 
          onPress={() => router.push({
            pathname: '/(root)/admin/userDetails',
            params: { userId: user.id }
          } as any)}
          className="bg-gray-100 p-2 rounded-full"
        >
          <MaterialCommunityIcons name="chevron-right" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <Header showProfileImage={false} showSideMenu={false} title={language === 'ar' ? 'ادارة المستخدمين' : 'Users Management'} />
        <ScrollView className="flex-1 px-4">
          <View className="py-4">
            {/* Search and Filter Skeleton */}
            <View className="mb-6">
              <View className="h-14 bg-gray-200 rounded-xl mb-4" />
              <View className="flex-row space-x-2">
                <View className="flex-1 h-10 bg-gray-200 rounded-full" />
                <View className="flex-1 h-10 bg-gray-200 rounded-full" />
                <View className="flex-1 h-10 bg-gray-200 rounded-full" />
              </View>
            </View>

            {/* Users List Skeleton */}
            <View>
              <SkeletonUserCard />
              <SkeletonUserCard />
              <SkeletonUserCard />
              <SkeletonUserCard />
              <SkeletonUserCard />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <Header showProfileImage={false} showSideMenu={false} title={language === 'ar' ? 'ادارة المستخدمين' : 'Users Management'} />
      <ScrollView className="flex-1 px-4">
        <View className="py-4">
          {/* Search and Filter */}
          <View className="mb-6">
            <TextInput
              className={`bg-white rounded-xl p-4 mb-4 shadow-sm ${language === 'ar' ? 'text-right font-CairoRegular' : 'text-left font-JakartaRegular'}`}
              placeholder={language === 'ar' ? 'البحث عن المستخدمين...' : 'Search users...'}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <View className={`flex-row ${language === 'ar' ? 'space-x-reverse space-x-2' : 'space-x-2'}`}>
              <TouchableOpacity 
                onPress={() => setFilter('all')}
                className={`flex-1 py-2 px-4 rounded-full ${filter === 'all' ? 'bg-blue-500' : 'bg-gray-200'}`}
              >
                <Text className={`text-center ${filter === 'all' ? 'text-white' : 'text-gray-600'} ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                  {language === 'ar' ? 'الكل' : 'All'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => setFilter('drivers')}
                className={`flex-1 py-2 px-4 rounded-full ${filter === 'drivers' ? 'bg-green-500' : 'bg-gray-200'}`}
              >
                <Text className={`text-center ${filter === 'drivers' ? 'text-white' : 'text-gray-600'} ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                  {language === 'ar' ? 'السائقين' : 'Drivers'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => setFilter('passengers')}
                className={`flex-1 py-2 px-4 rounded-full ${filter === 'passengers' ? 'bg-purple-500' : 'bg-gray-200'}`}
              >
                <Text className={`text-center ${filter === 'passengers' ? 'text-white' : 'text-gray-600'} ${language === 'ar' ? 'font-CairoMedium' : 'font-JakartaMedium'}`}>
                  {language === 'ar' ? 'الركاب' : 'Passengers'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Users List */}
          <View>
            {filteredUsers.map(user => (
              <UserCard key={user.id} user={user} />
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default UsersManagement; 