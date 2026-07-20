// Generated from the Supabase schema. Regenerate after schema changes with:
//   supabase gen types typescript --project-id lbbotfsgkqddzzshmwvw > src/lib/database.types.ts
// (or via the Supabase dashboard / MCP). This is the source of truth for DB row
// shapes; the hand-written types in src/types/index.ts mirror it for convenience.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assets: {
        Row: {
          created_at: string
          description: string | null
          embedding: string | null
          height: number | null
          id: string
          mime_type: string | null
          org_id: string
          source: string
          status: string
          storage_path: string
          tags: string[]
          title: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          embedding?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          org_id: string
          source?: string
          status?: string
          storage_path: string
          tags?: string[]
          title?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          embedding?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          org_id?: string
          source?: string
          status?: string
          storage_path?: string
          tags?: string[]
          title?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audio_assets: {
        Row: {
          artist: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          mime_type: string | null
          org_id: string
          source: string
          status: string
          storage_path: string
          tags: string[]
          title: string | null
        }
        Insert: {
          artist?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          mime_type?: string | null
          org_id: string
          source?: string
          status?: string
          storage_path: string
          tags?: string[]
          title?: string | null
        }
        Update: {
          artist?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          mime_type?: string | null
          org_id?: string
          source?: string
          status?: string
          storage_path?: string
          tags?: string[]
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audio_assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_kits: {
        Row: {
          colors: Json
          created_at: string
          fonts: Json
          id: string
          logo_url: string | null
          name: string
          org_id: string
          voice_guidelines: string | null
        }
        Insert: {
          colors?: Json
          created_at?: string
          fonts?: Json
          id?: string
          logo_url?: string | null
          name: string
          org_id: string
          voice_guidelines?: string | null
        }
        Update: {
          colors?: Json
          created_at?: string
          fonts?: Json
          id?: string
          logo_url?: string | null
          name?: string
          org_id?: string
          voice_guidelines?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_kits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      carousels: {
        Row: {
          audio_asset_id: string | null
          created_at: string
          id: string
          output_path: string | null
          request_id: string
          slide_count: number
          status: string
        }
        Insert: {
          audio_asset_id?: string | null
          created_at?: string
          id?: string
          output_path?: string | null
          request_id: string
          slide_count?: number
          status?: string
        }
        Update: {
          audio_asset_id?: string | null
          created_at?: string
          id?: string
          output_path?: string | null
          request_id?: string
          slide_count?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "carousels_audio_asset_id_fkey"
            columns: ["audio_asset_id"]
            isOneToOne: false
            referencedRelation: "audio_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carousels_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "content_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      content_requests: {
        Row: {
          brand_kit_id: string | null
          brief: string | null
          created_at: string
          id: string
          project_id: string
          status: string
          target_platform: string | null
          topic: string | null
        }
        Insert: {
          brand_kit_id?: string | null
          brief?: string | null
          created_at?: string
          id?: string
          project_id: string
          status?: string
          target_platform?: string | null
          topic?: string | null
        }
        Update: {
          brand_kit_id?: string | null
          brief?: string | null
          created_at?: string
          id?: string
          project_id?: string
          status?: string
          target_platform?: string | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_requests_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          org_id: string
          role: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          org_id: string
          role?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          org_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_assets: {
        Row: {
          asset_id: string
          created_at: string
          position: number
          project_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          position?: number
          project_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          position?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      slides: {
        Row: {
          asset_id: string | null
          body_copy: string | null
          carousel_id: string
          created_at: string
          headline: string | null
          id: string
          position: number
          render_path: string | null
        }
        Insert: {
          asset_id?: string | null
          body_copy?: string | null
          carousel_id: string
          created_at?: string
          headline?: string | null
          id?: string
          position?: number
          render_path?: string | null
        }
        Update: {
          asset_id?: string | null
          body_copy?: string | null
          carousel_id?: string
          created_at?: string
          headline?: string | null
          id?: string
          position?: number
          render_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slides_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slides_carousel_id_fkey"
            columns: ["carousel_id"]
            isOneToOne: false
            referencedRelation: "carousels"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_org_id: { Args: Record<PropertyKey, never>; Returns: string }
      pick_slide_asset: {
        Args: {
          match_threshold: number
          p_project_id: string
          query_embedding: string
        }
        Returns: {
          asset_id: string | null
          from_board: boolean
          similarity: number | null
          storage_path: string | null
        }[]
      }
      match_assets: {
        Args: {
          match_count: number
          match_threshold: number
          p_org_id: string
          query_embedding: string
        }
        Returns: {
          description: string
          id: string
          similarity: number
          storage_path: string
          tags: string[]
          title: string
        }[]
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
