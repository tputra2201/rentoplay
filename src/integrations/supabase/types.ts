export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      app_branding: {
        Row: {
          app_icon_url: string
          app_name: string
          app_version: string
          created_at: string
          developer_contact: string
          developer_email: string
          developer_name: string
          id: string
          login_note: string
          login_title: string
          logo_url: string
          release_date: string
          updated_at: string
        }
        Insert: {
          app_icon_url?: string
          app_name?: string
          app_version?: string
          created_at?: string
          developer_contact?: string
          developer_email?: string
          developer_name?: string
          id?: string
          login_note?: string
          login_title?: string
          logo_url?: string
          release_date?: string
          updated_at?: string
        }
        Update: {
          app_icon_url?: string
          app_name?: string
          app_version?: string
          created_at?: string
          developer_contact?: string
          developer_email?: string
          developer_name?: string
          id?: string
          login_note?: string
          login_title?: string
          logo_url?: string
          release_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      developer_accounts: {
        Row: {
          created_at: string
          email: string
          note: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          note?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          note?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      developer_stores: {
        Row: {
          base_url: string
          city: string
          control_secret: string
          created_at: string
          expires_at: string | null
          id: string
          label: string
          last_status: string
          last_synced_at: string | null
          note: string
          store_code: string
          store_name: string
          updated_at: string
        }
        Insert: {
          base_url?: string
          city?: string
          control_secret?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string
          last_status?: string
          last_synced_at?: string | null
          note?: string
          store_code?: string
          store_name?: string
          updated_at?: string
        }
        Update: {
          base_url?: string
          city?: string
          control_secret?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          label?: string
          last_status?: string
          last_synced_at?: string | null
          note?: string
          store_code?: string
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          must_change_password: boolean
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          must_change_password?: boolean
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          must_change_password?: boolean
        }
        Relationships: []
      }
      store_data: {
        Row: {
          created_at: string
          deleted: boolean
          entity_id: string
          kind: string
          payload: Json
          retired_session_before: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted?: boolean
          entity_id: string
          kind: string
          payload?: Json
          retired_session_before?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted?: boolean
          entity_id?: string
          kind?: string
          payload?: Json
          retired_session_before?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_data_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_members: {
        Row: {
          created_at: string
          id: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          address: string
          app_version: string
          city: string
          created_at: string
          dev_contact: string
          expires_at: string
          id: string
          owner_name: string
          phone: string
          singleton: boolean
          store_code: string
          store_email: string
          store_name: string
          updated_at: string
        }
        Insert: {
          address?: string
          app_version?: string
          city?: string
          created_at?: string
          dev_contact?: string
          expires_at?: string
          id?: string
          owner_name?: string
          phone?: string
          singleton?: boolean
          store_code?: string
          store_email?: string
          store_name?: string
          updated_at?: string
        }
        Update: {
          address?: string
          app_version?: string
          city?: string
          created_at?: string
          dev_contact?: string
          expires_at?: string
          id?: string
          owner_name?: string
          phone?: string
          singleton?: boolean
          store_code?: string
          store_email?: string
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          active: boolean
          address: string
          allowed_devices: Json
          allowed_ips: string[]
          app_version: string
          city: string
          created_at: string
          dev_contact: string
          device_code: string
          expires_at: string
          id: string
          logo_url: string
          note: string
          owner_name: string
          phone: string
          store_code: string
          store_email: string
          store_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string
          allowed_devices?: Json
          allowed_ips?: string[]
          app_version?: string
          city?: string
          created_at?: string
          dev_contact?: string
          device_code?: string
          expires_at?: string
          id?: string
          logo_url?: string
          note?: string
          owner_name?: string
          phone?: string
          store_code?: string
          store_email?: string
          store_name?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string
          allowed_devices?: Json
          allowed_ips?: string[]
          app_version?: string
          city?: string
          created_at?: string
          dev_contact?: string
          device_code?: string
          expires_at?: string
          id?: string
          logo_url?: string
          note?: string
          owner_name?: string
          phone?: string
          store_code?: string
          store_email?: string
          store_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          device: string
          last_seen_at: string
          store_id: string | null
          user_id: string
        }
        Insert: {
          device?: string
          last_seen_at?: string
          store_id?: string | null
          user_id: string
        }
        Update: {
          device?: string
          last_seen_at?: string
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_presence_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      developer_is_developer: { Args: never; Returns: boolean }
      developer_list_stores: {
        Args: never
        Returns: {
          active: boolean
          city: string
          current_store_id: string
          expires_at: string
          id: string
          store_code: string
          store_name: string
        }[]
      }
      developer_switch_store: { Args: { _store_id: string }; Returns: string }
      store_apply_intents: {
        Args: { _records: Json; _store_id: string }
        Returns: Json
      }
      store_set_device_access:
        | {
            Args: { _allowed_ips: string[]; _device_code: string }
            Returns: undefined
          }
        | {
            Args: {
              _allowed_devices?: Json
              _allowed_ips: string[]
              _device_code: string
            }
            Returns: number
          }
    }
    Enums: {
      app_role:
        | "admin"
        | "kasir"
        | "installer"
        | "manager"
        | "finance"
        | "operator"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "kasir",
        "installer",
        "manager",
        "finance",
        "operator",
      ],
    },
  },
} as const
