-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  avatar_color TEXT DEFAULT '#FF6B6B',
  total_score INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create game lobbies table
CREATE TABLE public.lobbies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  max_players INTEGER DEFAULT 4,
  current_players INTEGER DEFAULT 0,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  host_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  wave_number INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create game players table for tracking players in lobbies
CREATE TABLE public.game_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lobby_id UUID NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  position_x REAL DEFAULT 50,
  position_y REAL DEFAULT 50,
  health INTEGER DEFAULT 100,
  score INTEGER DEFAULT 0,
  is_alive BOOLEAN DEFAULT true,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(lobby_id, player_id)
);

-- Create targets table for game targets
CREATE TABLE public.targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lobby_id UUID NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  color_intensity REAL NOT NULL CHECK (color_intensity >= 0 AND color_intensity <= 1),
  health INTEGER DEFAULT 1,
  points INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create game events table for real-time synchronization
CREATE TABLE public.game_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lobby_id UUID NOT NULL REFERENCES public.lobbies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('shot', 'hit', 'target_destroyed', 'player_damaged', 'wave_complete')),
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create policies for lobbies
CREATE POLICY "Users can view all lobbies" ON public.lobbies FOR SELECT USING (true);
CREATE POLICY "Users can create lobbies" ON public.lobbies FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Hosts can update their lobbies" ON public.lobbies FOR UPDATE USING (auth.uid() = host_id);

-- Create policies for game players
CREATE POLICY "Users can view players in lobbies" ON public.game_players FOR SELECT USING (true);
CREATE POLICY "Users can join lobbies" ON public.game_players FOR INSERT WITH CHECK (auth.uid() = player_id);
CREATE POLICY "Users can update their own game state" ON public.game_players FOR UPDATE USING (auth.uid() = player_id);

-- Create policies for targets
CREATE POLICY "Users can view targets in their lobbies" ON public.targets FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.game_players gp 
    WHERE gp.lobby_id = targets.lobby_id AND gp.player_id = auth.uid()
  )
);
CREATE POLICY "System can manage targets" ON public.targets FOR ALL USING (true);

-- Create policies for game events
CREATE POLICY "Users can view events in their lobbies" ON public.game_events FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.game_players gp 
    WHERE gp.lobby_id = game_events.lobby_id AND gp.player_id = auth.uid()
  )
);
CREATE POLICY "Users can create events" ON public.game_events FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.game_players gp 
    WHERE gp.lobby_id = game_events.lobby_id AND gp.player_id = auth.uid()
  )
);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lobbies_updated_at BEFORE UPDATE ON public.lobbies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  username_base TEXT;
  final_username TEXT;
  counter INTEGER := 1;
BEGIN
  -- Generate base username from email
  username_base := split_part(NEW.email, '@', 1);
  final_username := username_base;
  
  -- Ensure username is unique
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
    final_username := username_base || counter::TEXT;
    counter := counter + 1;
  END LOOP;
  
  -- Insert profile
  INSERT INTO public.profiles (user_id, username)
  VALUES (NEW.id, final_username);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic profile creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime for all tables
ALTER TABLE public.lobbies REPLICA IDENTITY FULL;
ALTER TABLE public.game_players REPLICA IDENTITY FULL;
ALTER TABLE public.targets REPLICA IDENTITY FULL;
ALTER TABLE public.game_events REPLICA IDENTITY FULL;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.lobbies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.targets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.game_events;