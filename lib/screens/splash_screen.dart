import 'dart:async';

import 'package:flutter/material.dart';

import '../config/hospital_config.dart';
import 'start_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer(const Duration(seconds: 3), () {
      if (!mounted) {
        return;
      }
      Navigator.of(context).pushReplacement(
        PageRouteBuilder<void>(
          pageBuilder: (context, animation, secondaryAnimation) =>
              const StartScreen(),
          transitionDuration: const Duration(milliseconds: 350),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return FadeTransition(opacity: animation, child: child);
          },
        ),
      );
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFFF4FBFF), Color(0xFFF4FBF6), Color(0xFFFFFFFF)],
          ),
        ),
        child: Center(
          child: Container(
            constraints: const BoxConstraints(maxWidth: 760),
            margin: const EdgeInsets.all(24),
            padding: const EdgeInsets.symmetric(horizontal: 42, vertical: 48),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.92),
              borderRadius: BorderRadius.circular(32),
              border: Border.all(color: const Color(0xFFD7E4F0)),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x120E2233),
                  blurRadius: 28,
                  offset: Offset(0, 16),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 92,
                  height: 92,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const LinearGradient(
                      colors: [Color(0xFF1C658C), Color(0xFF2F8F5B)],
                    ),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x1C1C658C),
                        blurRadius: 20,
                        offset: Offset(0, 10),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.verified_user_rounded,
                    color: Colors.white,
                    size: 42,
                  ),
                ),
                const SizedBox(height: 28),
                RichText(
                  textAlign: TextAlign.center,
                  text: TextSpan(
                    style: TextStyle(
                      fontSize: 42,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -1.2,
                    ),
                    children: [
                      TextSpan(
                        text: '${HospitalConfig.hospitalShortName} ',
                        style: TextStyle(color: Color(0xFF1B5E8C)),
                      ),
                      TextSpan(
                        text: 'ABDM',
                        style: TextStyle(color: Color(0xFF2F8F5B)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),
                Text(
                  'Launching the ${HospitalConfig.hospitalName} ABDM workspace for identity, verification, and health workflows.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Color(0xFF577086),
                    fontSize: 16,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 28),
                SizedBox(
                  width: 34,
                  height: 34,
                  child: CircularProgressIndicator(
                    strokeWidth: 3,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      Color(0xFF1B5E8C),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
