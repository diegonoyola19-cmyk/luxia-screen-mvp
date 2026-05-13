import React from 'react';

export const LuxiaIcon = ({ width = 48, height = 48, className = "" }) => (
  <svg width={width} height={height} viewBox="45 30 110 140" xmlns="http://www.w3.org/2000/svg" className={className}>
    <g transform="translate(48, 35)">
        <g transform="translate(56, 0)">
            <rect x="0" y="0" width="45" height="8" fill="#A0A0A0" opacity="0.6"/>
            <polygon points="5,8 40,8 40,90 5,100" fill="#A0A0A0" opacity="0.6"/>
        </g>
        <g transform="translate(28, 0)">
            <rect x="0" y="0" width="45" height="8" fill="#8B1E32" opacity="0.6"/>
            <polygon points="5,8 40,8 40,105 5,115" fill="#8B1E32" opacity="0.6"/>
        </g>
        <g transform="translate(0, 0)">
            <rect x="0" y="0" width="45" height="8" fill="#8B1E32" opacity="1.0"/>
            <polygon points="5,8 40,8 40,120 5,130" fill="#8B1E32" opacity="1.0"/>
        </g>
    </g>
  </svg>
);
