import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { LogOut, Target as TargetIcon } from 'lucide-react';

interface Player {
  id: string;
  player_id: string;
  position_x: number;
  position_y: number;
  health: number;
  score: number;
  is_alive: boolean;
  profiles: {
    username: string;
    avatar_color: string;
  };
}

interface Target {
  id: string;
  position_x: number;
  position_y: number;
  color_intensity: number;
  health: number;
  points: number;
  is_active: boolean;
}

interface GameState {
  players: Player[];
  targets: Target[];
  wave: number;
  gameStatus: 'playing' | 'wave_complete' | 'game_over';
}

export default function Game() {
  const { lobbyId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>();
  const lastUpdateRef = useRef<number>(0);

  const [gameState, setGameState] = useState<GameState>({
    players: [],
    targets: [],
    wave: 1,
    gameStatus: 'playing',
  });

  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [keys, setKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !lobbyId) {
      navigate('/');
      return;
    }

    initializeGame();
    setupEventListeners();
    startGameLoop();

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [user, lobbyId]);

  const initializeGame = async () => {
    if (!lobbyId || !user) return;

    // Fetch initial game state
    const { data: players } = await supabase
      .from('game_players')
      .select(`
        *,
        profiles:player_id (
          username,
          avatar_color
        )
      `)
      .eq('lobby_id', lobbyId);

    if (players) {
      setGameState(prev => ({ ...prev, players: players as Player[] }));
      const me = players.find(p => p.player_id === user.id);
      if (me) setMyPlayer(me as Player);
    }

    // Generate initial targets
    await generateTargets();

    // Subscribe to real-time updates
    setupRealtimeSubscriptions();
  };

  const generateTargets = async () => {
    if (!lobbyId) return;

    const targetsToGenerate = Math.min(5 + gameState.wave, 15);
    const newTargets = [];

    for (let i = 0; i < targetsToGenerate; i++) {
      const colorIntensity = Math.random();
      const points = Math.ceil((1 - colorIntensity) * 10);
      
      const target = {
        lobby_id: lobbyId,
        position_x: Math.random() * 800,
        position_y: Math.random() * 600,
        color_intensity: colorIntensity,
        health: Math.ceil(colorIntensity * 3) + 1,
        points,
        is_active: true,
      };

      newTargets.push(target);
    }

    await supabase.from('targets').insert(newTargets);
  };

  const setupRealtimeSubscriptions = () => {
    if (!lobbyId) return;

    const channel = supabase
      .channel(`game-${lobbyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_players',
          filter: `lobby_id=eq.${lobbyId}`,
        },
        (payload) => {
          fetchGameState();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'targets',
          filter: `lobby_id=eq.${lobbyId}`,
        },
        (payload) => {
          fetchGameState();
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  };

  const fetchGameState = async () => {
    if (!lobbyId) return;

    const [playersResult, targetsResult] = await Promise.all([
      supabase
        .from('game_players')
        .select(`
          *,
          profiles:player_id (
            username,
            avatar_color
          )
        `)
        .eq('lobby_id', lobbyId),
      supabase
        .from('targets')
        .select('*')
        .eq('lobby_id', lobbyId)
        .eq('is_active', true),
    ]);

    if (playersResult.data) {
      setGameState(prev => ({ ...prev, players: playersResult.data as Player[] }));
      const me = playersResult.data.find(p => p.player_id === user?.id);
      if (me) setMyPlayer(me as Player);
    }

    if (targetsResult.data) {
      setGameState(prev => ({ ...prev, targets: targetsResult.data as Target[] }));
      
      // Check if wave is complete
      if (targetsResult.data.length === 0) {
        setGameState(prev => ({ ...prev, gameStatus: 'wave_complete' }));
        setTimeout(() => {
          nextWave();
        }, 2000);
      }
    }
  };

  const nextWave = async () => {
    setGameState(prev => ({ 
      ...prev, 
      wave: prev.wave + 1, 
      gameStatus: 'playing' 
    }));
    await generateTargets();
    toast({
      title: `Wave ${gameState.wave + 1}`,
      description: "New targets incoming!",
    });
  };

  const setupEventListeners = () => {
    const handleKeyDown = (e: KeyboardEvent) => {
      setKeys(prev => new Set(prev).add(e.key.toLowerCase()));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      setKeys(prev => {
        const newKeys = new Set(prev);
        newKeys.delete(e.key.toLowerCase());
        return newKeys;
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setMousePos({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }
    };

    const handleClick = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        shoot(clickX, clickY);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
    };
  };

  const updatePlayerPosition = useCallback(async (deltaTime: number) => {
    if (!myPlayer || !lobbyId) return;

    let newX = myPlayer.position_x;
    let newY = myPlayer.position_y;
    const speed = 200; // pixels per second

    if (keys.has('w') || keys.has('arrowup')) newY -= speed * deltaTime;
    if (keys.has('s') || keys.has('arrowdown')) newY += speed * deltaTime;
    if (keys.has('a') || keys.has('arrowleft')) newX -= speed * deltaTime;
    if (keys.has('d') || keys.has('arrowright')) newX += speed * deltaTime;

    // Keep player within bounds
    newX = Math.max(20, Math.min(780, newX));
    newY = Math.max(20, Math.min(580, newY));

    if (newX !== myPlayer.position_x || newY !== myPlayer.position_y) {
      await supabase
        .from('game_players')
        .update({
          position_x: newX,
          position_y: newY,
        })
        .eq('lobby_id', lobbyId)
        .eq('player_id', user?.id);
    }
  }, [myPlayer, keys, lobbyId, user]);

  const shoot = async (targetX: number, targetY: number) => {
    if (!myPlayer || !lobbyId) return;

    // Check if we hit any targets
    const hitTarget = gameState.targets.find(target => {
      const distance = Math.sqrt(
        Math.pow(target.position_x - targetX, 2) + 
        Math.pow(target.position_y - targetY, 2)
      );
      return distance < 25; // 25px hit radius
    });

    if (hitTarget) {
      // Damage target
      const newHealth = hitTarget.health - 1;
      
      if (newHealth <= 0) {
        // Destroy target
        await supabase
          .from('targets')
          .update({ is_active: false })
          .eq('id', hitTarget.id);

        // Add score to player
        await supabase
          .from('game_players')
          .update({
            score: myPlayer.score + hitTarget.points,
          })
          .eq('lobby_id', lobbyId)
          .eq('player_id', user?.id);

        toast({
          title: `+${hitTarget.points} points!`,
          description: "Target destroyed!",
        });
      } else {
        // Update target health
        await supabase
          .from('targets')
          .update({ health: newHealth })
          .eq('id', hitTarget.id);
      }

      // Log the shot event
      await supabase
        .from('game_events')
        .insert({
          lobby_id: lobbyId,
          event_type: newHealth <= 0 ? 'target_destroyed' : 'hit',
          data: {
            player_id: user?.id,
            target_id: hitTarget.id,
            damage: 1,
            points_earned: newHealth <= 0 ? hitTarget.points : 0,
          },
        });
    }
  };

  const startGameLoop = () => {
    const gameLoop = (timestamp: number) => {
      const deltaTime = (timestamp - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = timestamp;

      if (deltaTime < 1) { // Prevent huge delta times
        updatePlayerPosition(deltaTime);
        render();
      }

      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  };

  const render = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Clear canvas
    ctx.fillStyle = 'hsl(220, 60%, 5%)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw targets
    gameState.targets.forEach(target => {
      const gray = Math.floor(target.color_intensity * 255);
      ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
      ctx.beginPath();
      ctx.arc(target.position_x, target.position_y, 20, 0, 2 * Math.PI);
      ctx.fill();

      // Draw health bar
      if (target.health > 1) {
        ctx.fillStyle = 'hsl(0, 80%, 60%)';
        ctx.fillRect(target.position_x - 15, target.position_y - 30, 30, 4);
        ctx.fillStyle = 'hsl(120, 80%, 50%)';
        ctx.fillRect(target.position_x - 15, target.position_y - 30, 30 * (target.health / 3), 4);
      }

      // Draw points
      ctx.fillStyle = 'hsl(60, 100%, 70%)';
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(target.points.toString(), target.position_x, target.position_y + 5);
    });

    // Draw players
    gameState.players.forEach(player => {
      // Player circle
      ctx.fillStyle = player.profiles.avatar_color;
      ctx.beginPath();
      ctx.arc(player.position_x, player.position_y, 15, 0, 2 * Math.PI);
      ctx.fill();

      // Player glow
      if (player.player_id === user?.id) {
        ctx.strokeStyle = 'hsl(280, 100%, 80%)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Health bar
      const healthPercent = player.health / 100;
      let healthColor = 'hsl(120, 80%, 50%)';
      if (healthPercent < 0.3) healthColor = 'hsl(0, 80%, 60%)';
      else if (healthPercent < 0.6) healthColor = 'hsl(45, 100%, 60%)';

      ctx.fillStyle = 'hsl(0, 0%, 20%)';
      ctx.fillRect(player.position_x - 20, player.position_y - 30, 40, 6);
      ctx.fillStyle = healthColor;
      ctx.fillRect(player.position_x - 20, player.position_y - 30, 40 * healthPercent, 6);

      // Username
      ctx.fillStyle = 'hsl(220, 30%, 95%)';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(player.profiles.username, player.position_x, player.position_y - 35);
    });

    // Draw crosshair
    ctx.strokeStyle = 'hsl(60, 100%, 70%)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mousePos.x - 10, mousePos.y);
    ctx.lineTo(mousePos.x + 10, mousePos.y);
    ctx.moveTo(mousePos.x, mousePos.y - 10);
    ctx.lineTo(mousePos.x, mousePos.y + 10);
    ctx.stroke();
  };

  const leaveGame = async () => {
    if (!lobbyId || !user) return;

    // Remove player from game
    await supabase
      .from('game_players')
      .delete()
      .eq('lobby_id', lobbyId)
      .eq('player_id', user.id);

    navigate('/');
  };

  if (!myPlayer) {
    return (
      <div className="min-h-screen bg-game-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading game...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-game-bg p-4">
      <div className="max-w-6xl mx-auto">
        {/* Game HUD */}
        <div className="mb-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <Badge variant="secondary" className="text-lg">
              Wave {gameState.wave}
            </Badge>
            <div className="flex items-center space-x-2">
              <TargetIcon className="h-4 w-4" />
              <span>Score: {myPlayer.score}</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span>Health:</span>
              <Progress value={myPlayer.health} className="w-24" />
            </div>
            <Button variant="outline" onClick={leaveGame}>
              <LogOut className="mr-2 h-4 w-4" />
              Leave
            </Button>
          </div>
        </div>

        {/* Game Canvas */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="border border-border rounded-lg bg-game-bg cursor-none"
            style={{ display: 'block', margin: '0 auto' }}
          />
          
          {gameState.gameStatus === 'wave_complete' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
              <div className="text-center text-white">
                <h2 className="text-4xl font-bold mb-2">Wave Complete!</h2>
                <p className="text-xl">Preparing next wave...</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mt-4 text-center text-sm text-muted-foreground">
          <p>Use WASD or arrow keys to move • Click to shoot • Aim with mouse</p>
        </div>

        {/* Player List */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          {gameState.players.map(player => (
            <div
              key={player.id}
              className="bg-card p-2 rounded-lg flex items-center space-x-2"
            >
              <div
                className="w-4 h-4 rounded-full"
                style={{ backgroundColor: player.profiles.avatar_color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {player.profiles.username}
                </p>
                <p className="text-xs text-muted-foreground">
                  Score: {player.score}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
