import 'package:flutter/material.dart';

import '../utils/registered_users_store.dart';

class BasicPatientRegistrationScreen extends StatefulWidget {
  const BasicPatientRegistrationScreen({super.key});

  @override
  State<BasicPatientRegistrationScreen> createState() =>
      _BasicPatientRegistrationScreenState();
}

class _BasicPatientRegistrationScreenState
    extends State<BasicPatientRegistrationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _mobileController = TextEditingController();
  final _uhidController = TextEditingController();
  final _addressController = TextEditingController();
  final _districtController = TextEditingController();
  final _stateController = TextEditingController();
  final _pincodeController = TextEditingController();

  String? _gender;
  DateTime? _dateOfBirth;

  @override
  void dispose() {
    _nameController.dispose();
    _mobileController.dispose();
    _uhidController.dispose();
    _addressController.dispose();
    _districtController.dispose();
    _stateController.dispose();
    _pincodeController.dispose();
    super.dispose();
  }

  Future<void> _pickDateOfBirth() async {
    final today = DateTime.now();
    final selected = await showDatePicker(
      context: context,
      initialDate: _dateOfBirth ?? DateTime(today.year - 30),
      firstDate: DateTime(1900),
      lastDate: today,
      helpText: 'Select date of birth',
    );
    if (selected != null && mounted) {
      setState(() => _dateOfBirth = selected);
    }
  }

  String _dateText(DateTime date) {
    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    return '$day-$month-${date.year}';
  }

  void _autoFillSauravKumar() {
    setState(() {
      _nameController.text = 'Saurav Kumar';
      _mobileController.text = '8298540343';
      _gender = 'Male';
      _dateOfBirth = DateTime(2000, 11, 5);
      _uhidController.clear();
      _addressController.text =
          'Bhawanandpur ward 7, Panapur, Birpur, Begusarai, Bihar';
      _districtController.text = 'Begusarai';
      _stateController.text = 'Bihar';
      _pincodeController.text = '851127';
    });
  }

  void _savePatient() {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    if (_gender == null || _dateOfBirth == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Select gender and date of birth.')),
      );
      return;
    }

    RegisteredUsersStore.upsert({
      'name': _nameController.text.trim(),
      'mobile': _mobileController.text.trim(),
      'uhid': _uhidController.text.trim(),
      'gender': _gender,
      'dob': _dateText(_dateOfBirth!),
      'address': _addressController.text.trim(),
      'district': _districtController.text.trim(),
      'state': _stateController.text.trim(),
      'pincode': _pincodeController.text.trim(),
      'AbhaAddress': '',
      'AbhaNumber': '',
      'source': 'manual_patient_registration_without_abha',
      'registeredAt': DateTime.now().toIso8601String(),
    });

    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Register Patient')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 760),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Patient without ABHA details',
                            style: TextStyle(
                              color: Color(0xFF17324A),
                              fontSize: 28,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        OutlinedButton.icon(
                          onPressed: _autoFillSauravKumar,
                          icon: const Icon(
                            Icons.auto_fix_high_rounded,
                            size: 18,
                          ),
                          label: const Text('Auto fill'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Register the patient with their basic details. They can be verified against ABHA later when ABHA details become available.',
                      style: TextStyle(color: Color(0xFF5F7280), height: 1.45),
                    ),
                    const SizedBox(height: 24),
                    _section(
                      title: 'Basic details',
                      child: Column(
                        children: [
                          TextFormField(
                            controller: _nameController,
                            textCapitalization: TextCapitalization.words,
                            decoration: const InputDecoration(
                              labelText: 'Full name *',
                              prefixIcon: Icon(Icons.person_outline_rounded),
                            ),
                            validator: (value) =>
                                value == null || value.trim().isEmpty
                                ? 'Enter the patient name.'
                                : null,
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _mobileController,
                            keyboardType: TextInputType.phone,
                            decoration: const InputDecoration(
                              labelText: 'Mobile number *',
                              prefixIcon: Icon(Icons.phone_outlined),
                            ),
                            validator: (value) {
                              final digits =
                                  value?.replaceAll(RegExp(r'[^0-9]'), '') ??
                                  '';
                              return digits.length == 10
                                  ? null
                                  : 'Enter a valid 10-digit mobile number.';
                            },
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: DropdownButtonFormField<String>(
                                  initialValue: _gender,
                                  decoration: const InputDecoration(
                                    labelText: 'Gender *',
                                    prefixIcon: Icon(Icons.people_outline),
                                  ),
                                  items: const ['Male', 'Female', 'Other']
                                      .map(
                                        (gender) => DropdownMenuItem(
                                          value: gender,
                                          child: Text(gender),
                                        ),
                                      )
                                      .toList(growable: false),
                                  onChanged: (value) =>
                                      setState(() => _gender = value),
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: InkWell(
                                  onTap: _pickDateOfBirth,
                                  borderRadius: BorderRadius.circular(8),
                                  child: InputDecorator(
                                    decoration: const InputDecoration(
                                      labelText: 'Date of birth *',
                                      prefixIcon: Icon(Icons.cake_outlined),
                                    ),
                                    child: Text(
                                      _dateOfBirth == null
                                          ? 'Select date'
                                          : _dateText(_dateOfBirth!),
                                      style: TextStyle(
                                        color: _dateOfBirth == null
                                            ? const Color(0xFF6A7D8D)
                                            : null,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _uhidController,
                            decoration: const InputDecoration(
                              labelText: 'Hospital UHID (optional)',
                              prefixIcon: Icon(Icons.badge_outlined),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    _section(
                      title: 'Address details',
                      child: Column(
                        children: [
                          TextFormField(
                            controller: _addressController,
                            minLines: 2,
                            maxLines: 3,
                            textCapitalization: TextCapitalization.sentences,
                            decoration: const InputDecoration(
                              labelText: 'Address',
                              alignLabelWithHint: true,
                              prefixIcon: Icon(Icons.home_outlined),
                            ),
                          ),
                          const SizedBox(height: 16),
                          Row(
                            children: [
                              Expanded(
                                child: TextFormField(
                                  controller: _districtController,
                                  textCapitalization: TextCapitalization.words,
                                  decoration: const InputDecoration(
                                    labelText: 'District',
                                  ),
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: TextFormField(
                                  controller: _stateController,
                                  textCapitalization: TextCapitalization.words,
                                  decoration: const InputDecoration(
                                    labelText: 'State',
                                  ),
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: TextFormField(
                                  controller: _pincodeController,
                                  keyboardType: TextInputType.number,
                                  maxLength: 6,
                                  decoration: const InputDecoration(
                                    labelText: 'Pincode',
                                    counterText: '',
                                  ),
                                  validator: (value) {
                                    final text = value?.trim() ?? '';
                                    return text.isEmpty ||
                                            RegExp(r'^\d{6}$').hasMatch(text)
                                        ? null
                                        : 'Use 6 digits.';
                                  },
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 28),
                    SizedBox(
                      height: 52,
                      child: ElevatedButton.icon(
                        onPressed: _savePatient,
                        icon: const Icon(Icons.person_add_alt_1_rounded),
                        label: const Text('Add Patient to List'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF2F8F5B),
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _section({required String title, required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFD7E4F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Color(0xFF17324A),
              fontSize: 17,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 18),
          child,
        ],
      ),
    );
  }
}
