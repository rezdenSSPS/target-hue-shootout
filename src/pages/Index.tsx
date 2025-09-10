import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Target, Users, Plus, LogIn, Trophy, Zap } from 'lucide-react';

interface Lobby {
  id: string;
  code: string;
  name: string;
  current_players: number;
  max_players: number;
  status: string;
}

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [lobbyName, setLobbyName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    } else if (user) {
      fetchLobbies();
    }
  }, [user, loading]);

  const fetchLobbies = async () => {
    const { data, error } = await supabase
      .from('lobbies')
      .select('*')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data) {
      setLobbies(data);
    }
  };

  const createLobby = async () => {
    if (!user || !lobbyName.trim()) return;

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const { data, error } = await supabase
      .from('lobbies')
      .insert({
        code,
        name: lobbyName.trim(),
        host_id: user.id,
        current_players: 0,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Failed to create lobby",
        description: error.message,
        variant: "destructive",
      });
    } else if (data) {
      toast({
        title: "Lobby created!",
        description: `Lobby code: ${code}`,
      });
      navigate(`/lobby/${code}`);
    }
  };

  const joinLobby = (code: string) => {
    if (code.trim()) {
      navigate(`/lobby/${code.toUpperCase()}`);
    }
  };

  const joinLobbyByCode = () => {
    if (joinCode.trim()) {
      joinLobby(joinCode);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-game-bg to-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to auth
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-game-bg to-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Target className="h-8 w-8 text-primary" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Target Shootout
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Welcome back,</p>
              <p className="font-medium">{user.email}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => supabase.auth.signOut()}
            >
              <LogIn className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-8">
        {/* Hero Section */}
        <div className="text-center space-y-4 py-8">
          <h2 className="text-4xl font-bold text-foreground">
            Multiplayer Target Shooting
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Compete with friends in real-time! Shoot targets, survive waves, and climb the leaderboard.
          </p>
          <div className="flex justify-center items-center space-x-8 text-sm text-muted-foreground">
            <div className="flex items-center space-x-1">
              <Zap className="h-4 w-4 text-primary" />
              <span>Real-time multiplayer</span>
            </div>
            <div className="flex items-center space-x-1">
              <Target className="h-4 w-4 text-secondary" />
              <span>Dynamic targets</span>
            </div>
            <div className="flex items-center space-x-1">
              <Trophy className="h-4 w-4 text-accent" />
              <span>Competitive scoring</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Plus className="mr-2 h-5 w-5" />
                Create Lobby
              </CardTitle>
              <CardDescription>
                Start a new game and invite friends
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showCreateForm ? (
                <Button 
                  onClick={() => setShowCreateForm(true)}
                  className="w-full"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create New Lobby
                </Button>
              ) : (
                <div className="space-y-3">
                  <Input
                    placeholder="Enter lobby name"
                    value={lobbyName}
                    onChange={(e) => setLobbyName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && createLobby()}
                  />
                  <div className="flex space-x-2">
                    <Button onClick={createLobby} className="flex-1">
                      Create
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowCreateForm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="mr-2 h-5 w-5" />
                Join Lobby
              </CardTitle>
              <CardDescription>
                Enter a lobby code to join a game
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Enter lobby code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && joinLobbyByCode()}
                className="font-mono"
              />
              <Button onClick={joinLobbyByCode} className="w-full">
                <Users className="mr-2 h-4 w-4" />
                Join Lobby
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Available Lobbies */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Available Lobbies</CardTitle>
            <CardDescription>
              Join an existing lobby or refresh to see new ones
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lobbies.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No lobbies available</p>
                <p className="text-sm">Create one or ask friends to share their lobby code</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {lobbies.map((lobby) => (
                  <div
                    key={lobby.id}
                    className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-medium truncate">{lobby.name}</h3>
                      <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                        {lobby.code}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">
                        {lobby.current_players}/{lobby.max_players} players
                      </span>
                      <Button
                        size="sm"
                        onClick={() => joinLobby(lobby.code)}
                        disabled={lobby.current_players >= lobby.max_players}
                      >
                        Join
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={fetchLobbies}>
                Refresh Lobbies
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Game Info */}
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>How to Play</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-medium">Game Mechanics</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Move with WASD or arrow keys</li>
                <li>• Aim with your mouse</li>
                <li>• Click to shoot at targets</li>
                <li>• Darker targets give more points</li>
                <li>• Targets shoot back - avoid damage!</li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-medium">Objectives</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Survive waves of increasing difficulty</li>
                <li>• Work together with other players</li>
                <li>• Score points by destroying targets</li>
                <li>• Keep your health above zero</li>
                <li>• Reach the highest wave possible</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
