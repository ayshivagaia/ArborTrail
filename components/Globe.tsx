
import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { GeoLocation } from '../types';

interface GlobeProps {
  locations: GeoLocation[];
}

const Globe: React.FC<GlobeProps> = ({ locations }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [landData, setLandData] = useState<any>(null);

  useEffect(() => {
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json').then((data: any) => {
      if (data) {
        const land = topojson.feature(data, data.objects.land);
        setLandData(land);
      }
    });
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !landData) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    const width = canvas.width;
    const height = canvas.height;
    const projection = d3.geoOrthographic()
      .scale(width / 2.2)
      .translate([width / 2, height / 2])
      .clipAngle(90);

    const path = d3.geoPath(projection, context);

    let rotation = 0;
    let animationFrameId: number;

    const render = () => {
      context.clearRect(0, 0, width, height);
      rotation += 0.25;
      projection.rotate([rotation, -15]);

      // 1. Atmospheric Glow
      context.shadowBlur = 40;
      context.shadowColor = 'rgba(163, 177, 138, 0.1)'; // Olive glow
      
      // 2. Ocean
      context.fillStyle = '#020617';
      context.beginPath();
      context.arc(width/2, height/2, width/2.2, 0, 2 * Math.PI);
      context.fill();
      context.shadowBlur = 0;

      // 3. Grid
      context.strokeStyle = 'rgba(163, 177, 138, 0.05)';
      context.lineWidth = 0.5;
      context.beginPath();
      path(d3.geoGraticule()());
      context.stroke();

      // 4. Landmasses (Olive tones)
      context.fillStyle = '#3a5a40';
      context.strokeStyle = '#588157';
      context.lineWidth = 0.3;
      context.beginPath();
      path(landData);
      context.fill();
      context.stroke();

      // 5. Habitat Markers (Olive bright)
      locations.forEach(loc => {
        const coords = projection([loc.lng, loc.lat]);
        if (coords) {
          const geoPoint: [number, number] = [loc.lng, loc.lat];
          const distance = d3.geoDistance(geoPoint, [-projection.rotate()[0], -projection.rotate()[1]]);
          
          if (distance < Math.PI / 2) {
            const pulse = (Math.sin(Date.now() / 300) + 1) / 2;
            
            context.fillStyle = '#a3b18a'; // Light olive marker
            context.shadowBlur = 15;
            context.shadowColor = '#588157';
            context.beginPath();
            context.arc(coords[0], coords[1], 4, 0, 2 * Math.PI);
            context.fill();
            context.shadowBlur = 0;

            context.strokeStyle = `rgba(163, 177, 138, ${0.4 * (1 - pulse)})`;
            context.lineWidth = 2;
            context.beginPath();
            context.arc(coords[0], coords[1], 4 + pulse * 15, 0, 2 * Math.PI);
            context.stroke();
          }
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [landData, locations]);

  return (
    <div className="flex flex-col items-center justify-center p-6">
      <div className="relative group">
        {!landData && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <i className="fas fa-leaf animate-pulse text-[#a3b18a] text-xl"></i>
          </div>
        )}
        <canvas 
          ref={canvasRef} 
          width={280} 
          height={280} 
          className="rounded-full transition-transform duration-700 group-hover:scale-105"
        />
      </div>
      <div className="mt-4 flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md">
        <i className="fas fa-satellite text-[10px] text-[#a3b18a]"></i>
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#a3b18a]/60">Global Distribution Map</span>
      </div>
    </div>
  );
};

export default Globe;
