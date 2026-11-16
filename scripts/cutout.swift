// 사진에서 옷만 남기고 배경을 투명하게 (macOS Vision 피사체 분리, 설치 필요 없음)
// 사용: swift scripts/cutout.swift <입력 사진> <출력.png>
import AppKit
import CoreImage
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count == 3 else {
  print("사용: swift scripts/cutout.swift <입력 사진> <출력.png>")
  exit(1)
}
guard let ci = CIImage(contentsOf: URL(fileURLWithPath: args[1])) else {
  print("사진을 읽지 못함: \(args[1])")
  exit(1)
}
let handler = VNImageRequestHandler(ciImage: ci)
let req = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([req])
guard let obs = req.results?.first else {
  print("피사체를 찾지 못함")
  exit(2)
}
// 여러 피사체가 잡히면(옷걸이 봉 등) 가장 큰 것만 쓴다
let sizes = obs.allInstances.map { i -> (Int, Int) in
  let m = try! obs.generateScaledMaskForImage(forInstances: [i], from: handler)
  let w = CVPixelBufferGetWidth(m), h = CVPixelBufferGetHeight(m)
  CVPixelBufferLockBaseAddress(m, .readOnly)
  let base = CVPixelBufferGetBaseAddress(m)!.assumingMemoryBound(to: Float32.self)
  let stride = CVPixelBufferGetBytesPerRow(m) / 4
  var n = 0
  for y in Swift.stride(from: 0, to: h, by: 4) { for x in Swift.stride(from: 0, to: w, by: 4) where base[y * stride + x] > 0.5 { n += 1 } }
  CVPixelBufferUnlockBaseAddress(m, .readOnly)
  return (i, n)
}
let keep = IndexSet([sizes.max { $0.1 < $1.1 }!.0])
let buf = try obs.generateMaskedImage(ofInstances: keep, from: handler, croppedToInstancesExtent: true)
let out = CIImage(cvPixelBuffer: buf)
try CIContext().writePNGRepresentation(of: out, to: URL(fileURLWithPath: args[2]), format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
print("ok 피사체 \(obs.allInstances.count)개 중 \(keep.count)개, \(Int(out.extent.width))x\(Int(out.extent.height))")
