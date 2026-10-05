const Course = require('../models/Course');

exports.getCourses = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const instCode = req.query.instCode || '';

    let query = {};
    if (search) {
      query.$or = [
        { courseName: { $regex: search,$options: 'i' } },
        { courseCode: { $regex: search,$options: 'i' } },
        { department: { $regex: search,$options: 'i' } }
      ];
    }
    if (status) query.status = status;
    if (instCode) query.instCode = instCode;

    const total = await Course.countDocuments(query);
    const totalPages = Math.ceil(total / limit) || 1;
    const items = await Course.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);

    res.status(200).json({ items, total, page, totalPages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createCourse = async (req, res) => {
  try {
    const { courseCode } = req.body;
    const existing = await Course.findOne({ courseCode: courseCode.trim() });
    if (existing) {
      return res.status(400).json({ message: `Course code ${courseCode} already exists` });
    }

    const course = new Course(req.body);
    const saved = await course.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateCourse = async (req, res) => {
  try {
    const updated = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Course not found' });
    res.status(200).json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteCourse = async (req, res) => {
  try {
    const deleted = await Course.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Course not found' });
    res.status(200).json({ message: 'Course deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};