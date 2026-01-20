import { useState, useEffect } from 'react';
import { Heart, Sparkles, Star } from 'lucide-react';

export function Birthday() {
  const [showMessage, setShowMessage] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; left: number; delay: number }[]>([]);

  useEffect(() => {
    // Generate floating hearts
    const newHearts = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 5,
    }));
    setHearts(newHearts);

    // Show message after a short delay
    const timer = setTimeout(() => setShowMessage(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-400 via-purple-500 to-indigo-600 flex items-center justify-center p-4 overflow-hidden relative">
      {/* Floating Hearts Background */}
      {hearts.map((heart) => (
        <div
          key={heart.id}
          className="absolute text-pink-200/30 animate-float"
          style={{
            left: `${heart.left}%`,
            animationDelay: `${heart.delay}s`,
            fontSize: `${Math.random() * 20 + 15}px`,
          }}
        >
          <Heart fill="currentColor" />
        </div>
      ))}

      {/* Main Content */}
      <div
        className={`relative z-10 text-center transition-all duration-1000 transform ${
          showMessage ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        {/* Sparkles */}
        <div className="flex justify-center gap-4 mb-6">
          <Sparkles className="w-8 h-8 text-yellow-300 animate-pulse" />
          <Star className="w-8 h-8 text-yellow-300 animate-spin-slow" fill="currentColor" />
          <Sparkles className="w-8 h-8 text-yellow-300 animate-pulse" />
        </div>

        {/* Main Card */}
        <div className="bg-white/20 backdrop-blur-lg rounded-3xl p-8 md:p-12 shadow-2xl border border-white/30 max-w-lg mx-auto">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <Heart
                className="w-20 h-20 text-red-400 animate-heartbeat"
                fill="currentColor"
              />
              <Heart
                className="w-20 h-20 text-red-500 absolute top-0 left-0 animate-heartbeat-delayed"
                fill="currentColor"
              />
            </div>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow-lg">
            Happy Birthday!
          </h1>

          <div className="text-6xl mb-6">🎂</div>

          <p className="text-xl md:text-2xl text-white/90 mb-6 leading-relaxed">
            To the most amazing person in my life
          </p>

          <div className="bg-white/10 rounded-2xl p-6 mb-6">
            <p className="text-lg text-white/95 italic leading-relaxed">
              "Every moment with you is a gift. You make every day brighter,
              every laugh louder, and every memory sweeter.
              I'm so lucky to have you in my life."
            </p>
          </div>

          <p className="text-2xl text-white font-semibold">
            I love you! 💕
          </p>

          <div className="mt-8 flex justify-center gap-2 text-3xl">
            <span className="animate-bounce" style={{ animationDelay: '0s' }}>🎈</span>
            <span className="animate-bounce" style={{ animationDelay: '0.1s' }}>🎁</span>
            <span className="animate-bounce" style={{ animationDelay: '0.2s' }}>🎉</span>
            <span className="animate-bounce" style={{ animationDelay: '0.3s' }}>🥳</span>
            <span className="animate-bounce" style={{ animationDelay: '0.4s' }}>🎈</span>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-white/70 text-sm">
          With all my love ❤️
        </p>
      </div>

      {/* Custom Styles */}
      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(100vh) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-100vh) rotate(720deg);
            opacity: 0;
          }
        }

        @keyframes heartbeat {
          0%, 100% {
            transform: scale(1);
          }
          25% {
            transform: scale(1.1);
          }
          50% {
            transform: scale(1);
          }
          75% {
            transform: scale(1.15);
          }
        }

        @keyframes heartbeat-delayed {
          0%, 100% {
            transform: scale(1);
            opacity: 0.5;
          }
          25% {
            transform: scale(1.2);
            opacity: 0.3;
          }
          50% {
            transform: scale(1);
            opacity: 0.5;
          }
          75% {
            transform: scale(1.25);
            opacity: 0.2;
          }
        }

        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .animate-float {
          animation: float 10s ease-in-out infinite;
        }

        .animate-heartbeat {
          animation: heartbeat 1.5s ease-in-out infinite;
        }

        .animate-heartbeat-delayed {
          animation: heartbeat-delayed 1.5s ease-in-out infinite;
        }

        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
      `}</style>
    </div>
  );
}
