export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          username: string;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          username: string;
          avatar_url?: string | null;
          created_at?: string;
        };
        Update: {
          username?: string;
          avatar_url?: string | null;
        };
      };
      friends: {
        Row: {
          id: string;
          user_id: string;
          friend_id: string;
          status: 'pending' | 'accepted';
          created_at: string;
        };
        Insert: {
          user_id: string;
          friend_id: string;
          status?: 'pending' | 'accepted';
        };
        Update: {
          status?: 'pending' | 'accepted';
        };
      };
      photos: {
        Row: {
          id: string;
          user_id: string;
          storage_path: string;
          develop_at: string;
          created_at: string;
          shared_to_feed: boolean;
          caption: string | null;
        };
        Insert: {
          user_id: string;
          storage_path: string;
          shared_to_feed?: boolean;
          caption?: string | null;
        };
        Update: {
          shared_to_feed?: boolean;
          caption?: string | null;
        };
      };
    };
  };
};

export type UserRow = Database['public']['Tables']['users']['Row'];
export type PhotoRow = Database['public']['Tables']['photos']['Row'];
export type FriendRow = Database['public']['Tables']['friends']['Row'];
