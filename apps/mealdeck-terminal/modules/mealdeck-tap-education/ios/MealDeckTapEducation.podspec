Pod::Spec.new do |s|
  s.name = 'MealDeckTapEducation'
  s.version = '0.1.0'
  s.summary = 'MealDeck native Tap to Pay merchant education'
  s.description = 'Presents Apple ProximityReaderDiscovery merchant education from the active app window.'
  s.license = { :type => 'Proprietary' }
  s.author = '313 Brands Ltd'
  s.homepage = 'https://mealdeck.co.uk'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://mealdeck.co.uk' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ProximityReader'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
