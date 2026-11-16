// 컷아웃으로 스튜디오 컷 만들기
// 사용: swift scripts/compose.swift <컷아웃.png> <위에서 자를 px> <출력-cut.png> <출력.jpg>
//  1) 행거 화면용 투명 컷아웃 (높이 720)
//  2) 상품 사진: 밝은 스튜디오 배경(#F3F3F1, 아래로 살짝 어두워짐) 3:4 캔버스 가운데 + 부드러운 그림자
import AppKit

let a = CommandLine.arguments
guard a.count == 5, let src = NSImage(contentsOfFile: a[1]) else {
  print("사용: swift scripts/compose.swift <컷아웃.png> <위에서 자를 px> <출력-cut.png> <출력.jpg>")
  exit(1)
}
let cropTop = CGFloat(Double(a[2]) ?? 0)
let rep = src.representations.first!
let pw = CGFloat(rep.pixelsWide), ph = CGFloat(rep.pixelsHigh)
let srcRect = NSRect(x: 0, y: 0, width: pw, height: ph - cropTop) // AppKit 좌표: 아래가 0

func render(_ w: Int, _ h: Int, _ draw: () -> Void) -> NSBitmapImageRep {
  let r = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: r)
  NSGraphicsContext.current?.imageInterpolation = .high
  draw()
  NSGraphicsContext.restoreGraphicsState()
  return r
}

// 1) 투명 컷아웃
let cw = pw, chh = ph - cropTop
let outH = 720, outW = Int((cw / chh) * 720)
let cut = render(outW, outH) {
  src.draw(in: NSRect(x: 0, y: 0, width: outW, height: outH), from: srcRect, operation: .sourceOver, fraction: 1)
}
try! cut.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[3]))

// 2) 스튜디오 상품 사진
let W: CGFloat = 900, H: CGFloat = 1200
let s = min(W * 0.76 / cw, H * 0.78 / chh)
let dw = cw * s, dh = chh * s
let photo = render(Int(W), Int(H)) {
  NSGradient(
    starting: NSColor(srgbRed: 0.965, green: 0.965, blue: 0.957, alpha: 1),
    ending: NSColor(srgbRed: 0.918, green: 0.914, blue: 0.902, alpha: 1))!
    .draw(in: NSRect(x: 0, y: 0, width: W, height: H), angle: -90)
  let shadow = NSShadow()
  shadow.shadowColor = NSColor(white: 0, alpha: 0.22)
  shadow.shadowBlurRadius = 36
  shadow.shadowOffset = NSSize(width: 0, height: -18)
  shadow.set()
  src.draw(in: NSRect(x: (W - dw) / 2, y: (H - dh) / 2 - 10, width: dw, height: dh), from: srcRect, operation: .sourceOver, fraction: 1)
}
try! photo.representation(using: .jpeg, properties: [.compressionFactor: 0.85])!.write(to: URL(fileURLWithPath: a[4]))
print("ok", outW, outH)
