import AppKit
let size = NSSize(width: 1024, height: 1024)
let pixels = Int(CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "1024")!
let context = CGContext(data: nil, width: pixels, height: pixels, bitsPerComponent: 8, bytesPerRow: pixels * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
context.scaleBy(x: CGFloat(pixels) / 1024, y: CGFloat(pixels) / 1024)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: false)
NSColor(srgbRed: 0.035, green: 0.09, blue: 0.13, alpha: 1).setFill()
NSRect(origin: .zero, size: size).fill()
let ring = NSBezierPath(ovalIn: NSRect(x: 140, y: 140, width: 744, height: 744))
NSColor(srgbRed: 0.10, green: 0.25, blue: 0.29, alpha: 1).setStroke(); ring.lineWidth = 6; ring.stroke()
NSColor(srgbRed: 0.20, green: 0.82, blue: 0.77, alpha: 1).setFill()
let mark = NSBezierPath()
mark.move(to: NSPoint(x: 270, y: 690)); mark.line(to: NSPoint(x: 720, y: 690)); mark.line(to: NSPoint(x: 630, y: 594)); mark.line(to: NSPoint(x: 558, y: 594)); mark.line(to: NSPoint(x: 558, y: 290)); mark.line(to: NSPoint(x: 454, y: 290)); mark.line(to: NSPoint(x: 454, y: 594)); mark.line(to: NSPoint(x: 270, y: 594)); mark.close(); mark.fill()
let north = NSBezierPath(); north.move(to: NSPoint(x: 714, y: 782)); north.line(to: NSPoint(x: 782, y: 782)); north.line(to: NSPoint(x: 782, y: 714)); north.close()
NSColor(srgbRed: 0.95, green: 0.78, blue: 0.44, alpha: 1).setFill(); north.fill()
NSGraphicsContext.restoreGraphicsState()
let bitmap = NSBitmapImageRep(cgImage: context.makeImage()!)
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
