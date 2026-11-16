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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string | null
          actor_kind: string
          after: Json | null
          at: string
          before: Json | null
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor?: string | null
          actor_kind: string
          after?: Json | null
          at?: string
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
        }
        Update: {
          action?: string
          actor?: string | null
          actor_kind?: string
          after?: Json | null
          at?: string
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
        }
        Relationships: []
      }
      customer_events: {
        Row: {
          created_at: string
          device_id: string
          id: number
          product_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: never
          product_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: never
          product_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_minutes: {
        Row: {
          gateway: string
          minute: string
          posts: number
        }
        Insert: {
          gateway: string
          minute: string
          posts?: number
        }
        Update: {
          gateway?: string
          minute?: string
          posts?: number
        }
        Relationships: []
      }
      gateway_raw: {
        Row: {
          body: string | null
          count: number
          id: number
          received_at: string | null
        }
        Insert: {
          body?: string | null
          count?: number
          id?: number
          received_at?: string | null
        }
        Update: {
          body?: string | null
          count?: number
          id?: number
          received_at?: string | null
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          actor: string | null
          created_at: string
          delta: number
          id: number
          note: string | null
          order_id: string | null
          reason: string
          sku_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          delta: number
          id?: never
          note?: string | null
          order_id?: string | null
          reason: string
          sku_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          delta?: number
          id?: never
          note?: string | null
          order_id?: string | null
          reason?: string
          sku_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "erp_stock_view"
            referencedColumns: ["sku_id"]
          },
          {
            foreignKeyName: "inventory_movements_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          close_note: string | null
          closed_at: string | null
          created_at: string
          device_id: string | null
          handled_by: string | null
          id: string
          outcome: string | null
          pay_method: string | null
          pickup_code: string
          product_id: string | null
          size: string | null
          sku_id: string | null
          status: string
          type: string
          updated_at: string | null
        }
        Insert: {
          amount?: number
          close_note?: string | null
          closed_at?: string | null
          created_at?: string
          device_id?: string | null
          handled_by?: string | null
          id?: string
          outcome?: string | null
          pay_method?: string | null
          pickup_code?: string
          product_id?: string | null
          size?: string | null
          sku_id?: string | null
          status?: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          close_note?: string | null
          closed_at?: string | null
          created_at?: string
          device_id?: string | null
          handled_by?: string | null
          id?: string
          outcome?: string | null
          pay_method?: string | null
          pickup_code?: string
          product_id?: string | null
          size?: string | null
          sku_id?: string | null
          status?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "erp_stock_view"
            referencedColumns: ["sku_id"]
          },
          {
            foreignKeyName: "orders_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          back_image_url: string | null
          brand: string
          category: string | null
          color: string | null
          emoji: string
          hanger: string
          id: string
          image_url: string | null
          mac: string | null
          major: number | null
          material: string | null
          minor: number | null
          model_url: string | null
          model_usdz_url: string | null
          name: string
          price: number
          sizes: Json
          sort: number
          status: string
          updated_at: string
          zone: string
        }
        Insert: {
          back_image_url?: string | null
          brand?: string
          category?: string | null
          color?: string | null
          emoji?: string
          hanger: string
          id: string
          image_url?: string | null
          mac?: string | null
          major?: number | null
          material?: string | null
          minor?: number | null
          model_url?: string | null
          model_usdz_url?: string | null
          name: string
          price: number
          sizes?: Json
          sort?: number
          status?: string
          updated_at?: string
          zone: string
        }
        Update: {
          back_image_url?: string | null
          brand?: string
          category?: string | null
          color?: string | null
          emoji?: string
          hanger?: string
          id?: string
          image_url?: string | null
          mac?: string | null
          major?: number | null
          material?: string | null
          minor?: number | null
          model_url?: string | null
          model_usdz_url?: string | null
          name?: string
          price?: number
          sizes?: Json
          sort?: number
          status?: string
          updated_at?: string
          zone?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          block_oversell: boolean
          id: number
          online_seconds: number
          rssi_threshold: number
        }
        Insert: {
          block_oversell?: boolean
          id?: number
          online_seconds?: number
          rssi_threshold?: number
        }
        Update: {
          block_oversell?: boolean
          id?: number
          online_seconds?: number
          rssi_threshold?: number
        }
        Relationships: []
      }
      sku_costs: {
        Row: {
          cost: number
          sku_id: string
          updated_at: string
        }
        Insert: {
          cost: number
          sku_id: string
          updated_at?: string
        }
        Update: {
          cost?: number
          sku_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sku_costs_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: true
            referencedRelation: "erp_stock_view"
            referencedColumns: ["sku_id"]
          },
          {
            foreignKeyName: "sku_costs_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: true
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      skus: {
        Row: {
          active: boolean
          barcode: string | null
          created_at: string
          id: string
          product_id: string
          reorder_point: number
          size: string
          sort: number
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          id: string
          product_id: string
          reorder_point?: number
          size: string
          sort?: number
        }
        Update: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          id?: string
          product_id?: string
          reorder_point?: number
          size?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "skus_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          role: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name?: string
          role: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      stock: {
        Row: {
          on_hand: number
          sku_id: string
          updated_at: string
        }
        Insert: {
          on_hand?: number
          sku_id: string
          updated_at?: string
        }
        Update: {
          on_hand?: number
          sku_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: true
            referencedRelation: "erp_stock_view"
            referencedColumns: ["sku_id"]
          },
          {
            foreignKeyName: "stock_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: true
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_minutes: {
        Row: {
          gateway: string | null
          minute: string
          product_id: string | null
          rssi_max: number | null
          rssi_min: number | null
          rssi_sum: number
          samples: number
          tag_key: string
        }
        Insert: {
          gateway?: string | null
          minute: string
          product_id?: string | null
          rssi_max?: number | null
          rssi_min?: number | null
          rssi_sum?: number
          samples?: number
          tag_key: string
        }
        Update: {
          gateway?: string | null
          minute?: string
          product_id?: string | null
          rssi_max?: number | null
          rssi_min?: number | null
          rssi_sum?: number
          samples?: number
          tag_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_minutes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_presence: {
        Row: {
          gateway: string | null
          key: string
          last_seen: string
          major: number
          minor: number
          rssi: number | null
          simulated: boolean
        }
        Insert: {
          gateway?: string | null
          key: string
          last_seen?: string
          major: number
          minor: number
          rssi?: number | null
          simulated?: boolean
        }
        Update: {
          gateway?: string | null
          key?: string
          last_seen?: string
          major?: number
          minor?: number
          rssi?: number | null
          simulated?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      erp_stock_view: {
        Row: {
          active: boolean | null
          low: boolean | null
          on_hand: number | null
          product_id: string | null
          product_name: string | null
          reorder_point: number | null
          size: string | null
          sku_id: string | null
          sort: number | null
        }
        Relationships: [
          {
            foreignKeyName: "skus_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      erp_add_staff: {
        Args: { p_email: string; p_name?: string; p_role: string }
        Returns: {
          active: boolean
          created_at: string
          display_name: string
          role: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "staff_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      erp_adjust_stock: {
        Args: {
          p_counted: number
          p_note?: string
          p_reason?: string
          p_sku: string
        }
        Returns: {
          on_hand: number
          sku_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      erp_dashboard: { Args: never; Returns: Json }
      erp_link_tag: {
        Args: {
          p_mac: string
          p_major?: number
          p_minor?: number
          p_product: string
        }
        Returns: {
          back_image_url: string | null
          brand: string
          category: string | null
          color: string | null
          emoji: string
          hanger: string
          id: string
          image_url: string | null
          mac: string | null
          major: number | null
          material: string | null
          minor: number | null
          model_url: string | null
          model_usdz_url: string | null
          name: string
          price: number
          sizes: Json
          sort: number
          status: string
          updated_at: string
          zone: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      erp_me: { Args: never; Returns: Json }
      erp_order_action: {
        Args: { p_action: string; p_note?: string; p_order: string }
        Returns: {
          amount: number
          close_note: string | null
          closed_at: string | null
          created_at: string
          device_id: string | null
          handled_by: string | null
          id: string
          outcome: string | null
          pay_method: string | null
          pickup_code: string
          product_id: string | null
          size: string | null
          sku_id: string | null
          status: string
          type: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      erp_product_funnel: {
        Args: { p_from: string; p_to: string }
        Returns: {
          fitting_requests: number
          fitting_to_purchase: number
          name: string
          product_id: string
          purchases: number
          view_to_purchase: number
          views: number
        }[]
      }
      erp_receive_stock: {
        Args: { p_note?: string; p_qty: number; p_sku: string }
        Returns: {
          on_hand: number
          sku_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      erp_sales_by_product: {
        Args: { p_from: string; p_to: string }
        Returns: {
          name: string
          net: number
          product_id: string
          refunds: number
          revenue: number
          units: number
        }[]
      }
      erp_sales_daily: {
        Args: { p_from: string; p_to: string }
        Returns: {
          day: string
          net: number
          orders: number
          refunds: number
          revenue: number
          units: number
        }[]
      }
      erp_save_product: {
        Args: { p: Json }
        Returns: {
          back_image_url: string | null
          brand: string
          category: string | null
          color: string | null
          emoji: string
          hanger: string
          id: string
          image_url: string | null
          mac: string | null
          major: number | null
          material: string | null
          minor: number | null
          model_url: string | null
          model_usdz_url: string | null
          name: string
          price: number
          sizes: Json
          sort: number
          status: string
          updated_at: string
          zone: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      erp_save_sku: {
        Args: {
          p_active?: boolean
          p_barcode?: string
          p_cost?: number
          p_product: string
          p_reorder_point?: number
          p_size: string
          p_sort?: number
        }
        Returns: {
          active: boolean
          barcode: string | null
          created_at: string
          id: string
          product_id: string
          reorder_point: number
          size: string
          sort: number
        }
        SetofOptions: {
          from: "*"
          to: "skus"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      erp_staff_list: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          display_name: string
          email: string
          role: string
          user_id: string
        }[]
      }
      erp_tag_activity: {
        Args: { p_from: string; p_rssi_threshold?: number; p_to: string }
        Returns: {
          avg_rssi: number
          away_count: number
          away_minutes: number
          gateway_minutes: number
          last_seen: string
          name: string
          product_id: string
          seen_minutes: number
        }[]
      }
      erp_update_settings: {
        Args: { p_block_oversell?: boolean; p_online?: number; p_rssi?: number }
        Returns: {
          block_oversell: boolean
          id: number
          online_seconds: number
          rssi_threshold: number
        }
        SetofOptions: {
          from: "*"
          to: "settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      erp_update_staff: {
        Args: {
          p_active?: boolean
          p_name?: string
          p_role?: string
          p_user: string
        }
        Returns: {
          active: boolean
          created_at: string
          display_name: string
          role: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "staff_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_raw: { Args: { p_body: string }; Returns: undefined }
      place_order: {
        Args: {
          p_device: string
          p_pay_method?: string
          p_product: string
          p_size: string
          p_type: string
        }
        Returns: {
          amount: number
          close_note: string | null
          closed_at: string | null
          created_at: string
          device_id: string | null
          handled_by: string | null
          id: string
          outcome: string | null
          pay_method: string | null
          pickup_code: string
          product_id: string | null
          size: string | null
          sku_id: string | null
          status: string
          type: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_check: { Args: { p_pin: string }; Returns: boolean }
      staff_set_order_status: {
        Args: { p_order: string; p_pin: string; p_status: string }
        Returns: {
          amount: number
          close_note: string | null
          closed_at: string | null
          created_at: string
          device_id: string | null
          handled_by: string | null
          id: string
          outcome: string | null
          pay_method: string | null
          pickup_code: string
          product_id: string | null
          size: string | null
          sku_id: string | null
          status: string
          type: string
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_update_settings: {
        Args: { p_online?: number; p_pin: string; p_rssi?: number }
        Returns: {
          block_oversell: boolean
          id: number
          online_seconds: number
          rssi_threshold: number
        }
        SetofOptions: {
          from: "*"
          to: "settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      track_event: {
        Args: { p_device: string; p_product?: string; p_type: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
