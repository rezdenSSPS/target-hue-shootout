import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Copy, Play, Users, Crown, LogOut } from 'lucide-react';

interface Lobby {
  id: string;
  code: string;
  name: string;
  max_players: number;
  current_players: number;
  status: string;
  host_id: string;
}

interface GamePlayer {
  id: string;
  player_id: string;
  profiles: {
    username: string;
    avatar_color: string;
  };
}

export default function Lobby() {
  const { code } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    if (code) {
      joinLobby(code);
    }
  }, [user, code]);

  useEffect(() => {
    if (!lobby) return;

    // Subscribe to lobby updates
    const lobbyChannel = supabase
      .channel(`lobby-${lobby.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lobbies',
          filter: `id=eq.${lobby.id}`,
        },
        (payload) => {
          if (payload.new && payload.eventType !== 'DELETE') {
            const newLobby = payload.new as Lobby;
            setLobby(newLobby);
            if (newLobby.status === 'playing') {
              navigate(`/game/${lobby.id}`);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_players',
          filter: `lobby_id=eq.${lobby.id}`,
        },
        () => {
          fetchPlayers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(lobbyChannel);
    };
  }, [lobby]);

  const joinLobby = async (lobbyCode: string) => {
    try {
      // Find lobby by code
      const { data: lobbyData, error: lobbyError } = await supabase
        .from('lobbies')
        .select('*')
        .eq('code', lobbyCode.toUpperCase())
        .single();

      if (lobbyError || !lobbyData) {
        toast({
          title: "Lobby not found",
          description: "Please check the lobby code and try again.",
          variant: "destructive",
        });
        navigate('/');
        return;
      }

      setLobby(lobbyData);

      // Check if player is already in the lobby
      const { data: existingPlayer } = await supabase
        .from('game_players')
        .select('*')
        .eq('lobby_id', lobbyData.id)
        .eq('player_id', user?.id)
        .single();

      if (!existingPlayer) {
        // Join the lobby
        const { error: joinError } = await supabase
          .from('game_players')
          .insert({
            lobby_id: lobbyData.id,
            player_id: user?.id,
          });

        if (joinError) {
          toast({
            title: "Failed to join lobby",
            description: joinError.message,
            variant: "destructive",
          });
          navigate('/');
          return;
        }

        // Update player count
        await supabase
          .from('lobbies')
          .update({ 
            current_players: lobbyData.current_players + 1 
          })
          .eq('id', lobbyData.id);
      }

      await fetchPlayers();
      setLoading(false);
    } catch (error) {
      console.error('Error joining lobby:', error);
      navigate('/');
    }
  };

  const fetchPlayers = async () => {
    if (!lobby) return;

    const { data, error } = await supabase
      .from('game_players')
      .select(`
        id,
        player_id,
        profiles:player_id (
          username,
          avatar_color
        )
      `)
      .eq('lobby_id', lobby.id);

    if (!error && data) {
      setPlayers(data as GamePlayer[]);
    }
  };

  const copyLobbyCode = () => {
    if (lobby) {
      navigator.clipboard.writeText(lobby.code);
      toast({
        title: "Lobby code copied!",
        description: "Share this code with your friends to invite them.",
      });
    }
  };

  const startGame = async () => {
    if (!lobby || lobby.host_id !== user?.id) return;

    const { error } = await supabase
      .from('lobbies')
      .update({ status: 'playing' })
      .eq('id', lobby.id);

    if (error) {
      toast({
        title: "Failed to start game",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const leaveLobby = async () => {
    if (!lobby || !user) return;

    // Remove player from lobby
    await supabase
      .from('game_players')
      .delete()
      .eq('lobby_id', lobby.id)
      .eq('player_id', user.id);

    // Update player count
    await supabase
      .from('lobbies')
      .update({ 
        current_players: Math.max(0, lobby.current_players - 1) 
      })
      .eq('id', lobby.id);

    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-game-bg to-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Joining lobby...</p>
        </div>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-game-bg to-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Lobby not found</h1>
          <Button onClick={() => navigate('/')} className="mt-4">
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const isHost = lobby.host_id === user?.id;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-game-bg to-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{lobby.name}</h1>
            <p className="text-muted-foreground">Waiting for players...</p>
          </div>
          <Button variant="outline" onClick={leaveLobby}>
            <LogOut className="mr-2 h-4 w-4" />
            Leave Lobby
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Lobby Code</span>
                <Badge variant="secondary" className="text-lg font-mono">
                  {lobby.code}
                </Badge>
              </CardTitle>
              <CardDescription>
                Share this code with friends to invite them
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={copyLobbyCode} className="w-full" variant="outline">
                <Copy className="mr-2 h-4 w-4" />
                Copy Code
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="mr-2 h-4 w-4" />
                Players ({players.length}/{lobby.max_players})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted"
                  >
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-6 h-6 rounded-full"
                        style={{ backgroundColor: player.profiles.avatar_color }}
                      />
                      <span className="font-medium">
                        {player.profiles.username}
                      </span>
                      {player.player_id === lobby.host_id && (
                        <Crown className="h-4 w-4 text-yellow-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {isHost && (
          <Card>
            <CardHeader>
              <CardTitle>Host Controls</CardTitle>
              <CardDescription>
                Start the game when all players are ready
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={startGame}
                className="w-full"
                disabled={players.length < 1}
              >
                <Play className="mr-2 h-4 w-4" />
                Start Game
              </Button>
              {players.length < 1 && (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  Need at least 1 player to start
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Game Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Shoot targets to earn points</p>
            <p>• Darker targets give more points</p>
            <p>• Targets will shoot back at you</p>
            <p>• Survive waves of increasingly difficult targets</p>
            <p>• Work together with other players to survive</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}