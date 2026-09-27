import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, QuadraticBezierLine, Stars } from "@react-three/drei";
import * as THREE from "three";
import ServiceSymbol from "./ServiceSymbol";

function midpoint(node) {
  return [node.position[0] * .5, node.position[1] * .5 + .25, node.position[2] * .45 + .4];
}

function CameraLayout() {
  const { size } = useThree();
  const pending = useRef(true);
  useEffect(() => { pending.current = true; }, [size.width, size.height]);
  useFrame(({ camera }) => {
    if (!pending.current) return;
    const aspect = size.width / size.height;
    camera.position.set(0, 0, aspect < 1 ? 13 : aspect > 1.8 ? 10.5 : 9.4);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    pending.current = false;
  });
  return null;
}

function Glow({ color, radius, opacity }) {
  return <mesh><sphereGeometry args={[radius, 32, 32]} /><meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>;
}

function Transfer({ node, progress }) {
  const ref = useRef(null);
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(...midpoint(node)), new THREE.Vector3(...node.position)), [node]);
  useFrame(() => {
    if (ref.current) ref.current.position.copy(curve.getPoint(progress));
  });
  return <group ref={ref}><mesh><sphereGeometry args={[.05, 16, 16]} /><meshBasicMaterial color={node.sensitive ? "#ff94be" : "#a8f4ff"} /></mesh><Glow color={node.color} radius={.10} opacity={.22} /></group>;
}

function DestinationNode({ node, active, onSelect }) {
  const [hovered, setHovered] = useState(false);
  return <group position={node.position}>
    <mesh onClick={(event) => { event.stopPropagation(); onSelect(node); }} onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
      <sphereGeometry args={[.25, 40, 40]} />
      <meshPhysicalMaterial color={node.color} emissive={node.color} emissiveIntensity={active ? .75 : hovered ? .5 : .3} roughness={.18} metalness={.12} clearcoat={1} />
    </mesh>
    <Glow color={node.color} radius={.30} opacity={active ? .22 : .12} />
    <Glow color={node.color} radius={.35} opacity={.05} />

  </group>;
}

function Scene({ nodes, activeNodeId, transfer, onEnterService }) {
  const transferNode = nodes.find((node) => node.id === transfer?.nodeId);
  return <>
    <CameraLayout />
    <ambientLight intensity={.22} />
    <directionalLight position={[5, 6, 8]} intensity={1.4} />
    <pointLight position={[-5, 2, 4]} intensity={3} color="#38bdf8" />
    <pointLight position={[4, -4, 2]} intensity={2.4} color="#a855f7" />
    <Stars radius={45} depth={25} count={75} factor={.35} saturation={0} fade speed={0} />
    <mesh><sphereGeometry args={[.55, 48, 48]} /><meshPhysicalMaterial color="#147ea0" emissive="#0e6486" emissiveIntensity={.25} roughness={.25} clearcoat={1} /></mesh>
    <Glow color="#22d3ee" radius={.64} opacity={.14} />
    <Glow color="#22d3ee" radius={.73} opacity={.05} />
    {nodes.map((node) => <group key={node.id}>
      <QuadraticBezierLine start={[0, 0, 0]} end={node.position} mid={midpoint(node)} color={node.color} lineWidth={activeNodeId === node.id ? 1.4 : .65} transparent opacity={activeNodeId === node.id ? .9 : .32} />
      <DestinationNode node={node} active={activeNodeId === node.id} onSelect={onEnterService} />
    </group>)}
    {transferNode && <Transfer node={transferNode} progress={transfer.progress} />}
    <OrbitControls enablePan={false} minDistance={7} maxDistance={16} zoomSpeed={.55} enableDamping dampingFactor={.06} />
  </>;
}

function LabelProjection({ nodes, labelRefs, sourceRef }) {
  useFrame(({ camera, size }) => {
    if (sourceRef.current) {
      // Keep the logo at a fixed world size relative to the source sphere.
      const distance = camera.position.length();
      const pixelsPerUnit = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance);
      sourceRef.current.style.transform = `translate(-50%, -50%) scale(${pixelsPerUnit * .8 / 76})`;
    }
    nodes.forEach((node) => {
      const element = labelRefs.current.get(node.id);
      if (!element) return;
      const point = new THREE.Vector3(...node.position).project(camera);
      element.style.visibility = point.z < -1 || point.z > 1 ? "hidden" : "visible";
      element.style.transform = `translate(${(point.x + 1) * size.width / 2}px, ${(-point.y + 1) * size.height / 2}px) translate(-50%, -50%)`;
      element.style.zIndex = String(Math.round((1 - point.z) * 100));
    });
  });
  return null;
}

export default function NetworkScene({ sourceName, nodes, activeNodeId, transfer, onEnterService, onClear }) {
  const labelRefs = useRef(new Map());
  const sourceRef = useRef(null);
  return <div className="network-stage">
    <Canvas camera={{ position: [0, 0, 9.4], fov: 40, near: .1, far: 100 }} dpr={[1, 2]} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }} onPointerMissed={onClear}>
      <Scene nodes={nodes} activeNodeId={activeNodeId} transfer={transfer} onEnterService={onEnterService} />
      <LabelProjection nodes={nodes} labelRefs={labelRefs} sourceRef={sourceRef} />
    </Canvas>
    <div className="app-node-mark" ref={sourceRef}><img src="./healthtrace-mark.svg" alt="PatientPrivy" /><span>{sourceName}</span></div>
    <div className="projected-labels">{nodes.map((node) => <button key={node.id} ref={(element) => { if (element) labelRefs.current.set(node.id, element); else labelRefs.current.delete(node.id); }} className="technical-node-label" onClick={() => onEnterService(node)} aria-label={`Inspect ${node.name}, ${node.fields.length} fields`}>
      <ServiceSymbol category={node.category} className="service-symbol" /><span>{node.name}<small>{node.fields.length} {node.fields.length === 1 ? "field" : "fields"}</small></span>
    </button>)}</div>
  </div>;
}
