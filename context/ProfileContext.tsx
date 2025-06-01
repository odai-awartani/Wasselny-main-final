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

  const refreshProfileImage = async () => {
    if (!user?.id) return;

    try {
      const userRef = doc(db, 'users', user.id);
      return new Promise<void>((resolve) => {
        const unsubscribe = onSnapshot(userRef, (doc) => {
          if (doc.exists()) {
            const userData = doc.data();
            const imageUrl = userData.profile_image_url || userData.driver?.profile_image_url || null;
            setProfileImageUrl(imageUrl);
          }
          resolve();
        });
      });
    } catch (error) {
      console.error('Error refreshing profile image:', error);
    }
  };

  useEffect(() => {
    if (user?.id) {
      refreshProfileImage();
    }
  }, [user?.id]);

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