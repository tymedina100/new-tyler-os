require 'xcodeproj'
project = Xcodeproj::Project.new('TylerOS.xcodeproj')
app = project.new_target(:application, 'TylerOS', :ios, '18.0')
group = project.main_group.new_group('TylerOS', 'TylerOS')
Dir['TylerOS/*.swift'].sort.each { |file| app.source_build_phase.add_file_reference(group.new_file(File.basename(file))) }
Dir["TylerOS/AppIcon*.png"].sort.each { |file| app.resources_build_phase.add_file_reference(group.new_file(File.basename(file))) }
app.build_configurations.each do |config|
 config.build_settings.merge!({'INFOPLIST_FILE'=>'TylerOS/Info.plist', 'PRODUCT_BUNDLE_IDENTIFIER'=>'com.tylermedina.tyleros.mobile', 'SWIFT_VERSION'=>'5.0', 'TARGETED_DEVICE_FAMILY'=>'1', 'GENERATE_INFOPLIST_FILE'=>'YES', 'INFOPLIST_KEY_CFBundleDisplayName'=>'TylerOS', 'INFOPLIST_KEY_UILaunchScreen_Generation'=>'YES', 'INFOPLIST_KEY_NSMicrophoneUsageDescription'=>'Dictate a capture using your iPhone microphone.', 'INFOPLIST_KEY_NSSpeechRecognitionUsageDescription'=>'Convert speech into a capture using on-device recognition only.', 'MARKETING_VERSION'=>'1.0.0', 'CURRENT_PROJECT_VERSION'=>'1', 'CODE_SIGN_STYLE'=>'Automatic', 'IPHONEOS_DEPLOYMENT_TARGET'=>'18.0', 'INFOPLIST_KEY_UISupportedInterfaceOrientations'=>'UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight'})
 config.build_settings['INFOPLIST_KEY_NSAppTransportSecurity_NSAllowsLocalNetworking'] = 'YES' if config.name == 'Debug'
end
tests = project.new_target(:unit_test_bundle, 'TylerOSTests', :ios, '18.0'); tests.add_dependency(app)
group = project.main_group.new_group('TylerOSTests', 'TylerOSTests')
Dir['TylerOSTests/*.swift'].sort.each { |file| tests.source_build_phase.add_file_reference(group.new_file(File.basename(file))) }
tests.build_configurations.each { |config| config.build_settings.merge!({'PRODUCT_BUNDLE_IDENTIFIER'=>'com.tylermedina.tyleros.mobile.tests', 'SWIFT_VERSION'=>'5.0', 'GENERATE_INFOPLIST_FILE'=>'YES', 'TEST_HOST'=>'$(BUILT_PRODUCTS_DIR)/TylerOS.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/TylerOS', 'BUNDLE_LOADER'=>'$(TEST_HOST)', 'CODE_SIGN_STYLE'=>'Automatic'}) }
ui = project.new_target(:ui_test_bundle, 'TylerOSUITests', :ios, '18.0'); ui.add_dependency(app)
group = project.main_group.new_group('TylerOSUITests', 'TylerOSUITests')
Dir['TylerOSUITests/*.swift'].sort.each { |file| ui.source_build_phase.add_file_reference(group.new_file(File.basename(file))) }
ui.build_configurations.each { |config| config.build_settings.merge!({'PRODUCT_BUNDLE_IDENTIFIER'=>'com.tylermedina.tyleros.mobile.uitests', 'SWIFT_VERSION'=>'5.0', 'GENERATE_INFOPLIST_FILE'=>'YES', 'TEST_TARGET_NAME'=>'TylerOS', 'CODE_SIGN_STYLE'=>'Automatic'}) }
project.save
scheme = Xcodeproj::XCScheme.new; scheme.add_build_target(app); scheme.set_launch_target(app); scheme.add_test_target(tests); scheme.add_test_target(ui); scheme.save_as(project.path, 'TylerOS', true)
