import React, { createContext, useContext, useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ProfileContextType {
  profileImageUrl: string | null;
  refreshProfileImage: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    // Set up real-time listener for profile image updates
    const userRef = doc(db, 'users', user.id);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        const imageUrl = userData.profile_image_url || userData.driver?.profile_image_url || user?.imageUrl || null;
        setProfileImageUrl(imageUrl);
      }
    }, (error) => {
      console.error('Error in profile image listener:', error);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [user?.id, user?.imageUrl]);

  const refreshProfileImage = async () => {
    if (!user?.id) return;

    try {
      const userRef = doc(db, 'users', user.id);
      const doc = await userRef.get();
      if (doc.exists()) {
        const userData = doc.data();
        const imageUrl = userData.profile_image_url || userData.driver?.profile_image_url || user?.imageUrl || null;
        setProfileImageUrl(imageUrl);
      }
    } catch (error) {
      console.error('Error refreshing profile image:', error);
    }
  };

  return (
    <ProfileContext.Provider value={{ profileImageUrl, refreshProfileImage }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}; 