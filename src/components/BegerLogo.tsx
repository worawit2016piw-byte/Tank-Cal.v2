import React from 'react';

interface BegerLogoProps {
  className?: string;
  height?: number | string;
}

export const BegerLogo: React.FC<BegerLogoProps> = ({ className = 'h-10', height }) => {
  return (
    <div
      className={`inline-flex items-center select-none ${className}`}
      style={height ? { height } : undefined}
    >
      <svg
        viewBox="0 0 170 100"
        className="h-full w-auto max-h-full rounded shadow-sm overflow-hidden"
        style={{ aspectRatio: '1.7 / 1' }}
      >
        {/* Navy Blue Brand Background */}
        <rect width="170" height="100" fill="#1b3687" />

        {/* Thai Brand Name: "สีเบเยอร์" */}
        <text
          x="85"
          y="42"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="36"
          fontWeight="900"
          fontFamily="'Sarabun', 'Arial Black', sans-serif"
          letterSpacing="0.5"
        >
          สีเบเยอร์
        </text>

        {/* Outer White Border for English Logo Box */}
        <rect
          x="10"
          y="52"
          width="150"
          height="40"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2"
        />

        {/* Left Side: Orbit & Aerodynamic Wing */}
        <g transform="translate(14, 54)">
          {/* Orbit ellipse */}
          <ellipse
            cx="22"
            cy="18"
            rx="16"
            ry="11"
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.6"
            transform="rotate(-20 22 18)"
          />
          {/* Aerodynamic wing shape */}
          <polygon
            points="7,19 32,8 36,25 24,23 20,27"
            fill="#ffffff"
          />
          {/* Small Thai text "ตรา" */}
          <text x="3" y="32" fill="#ffffff" fontSize="5.5" fontWeight="bold">
            ตรา
          </text>
          {/* Small word "beger" */}
          <text x="24" y="11" fill="#ffffff" fontSize="6.5" fontWeight="bold">
            beger
          </text>
        </g>

        {/* Right Side: Red Slanted Banner with "Beger" */}
        <polygon
          points="58,55 146,55 142,88 52,88"
          fill="#e11d27"
        />

        {/* English Brand Name: "Beger" */}
        <text
          x="99"
          y="81"
          textAnchor="middle"
          fill="#ffffff"
          fontSize="24"
          fontWeight="900"
          fontFamily="'Arial Black', sans-serif"
          fontStyle="italic"
          letterSpacing="-0.5"
        >
          Beger
        </text>
      </svg>
    </div>
  );
};
